import java.io.*;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.TimeUnit;

public class FileBasedAIChat {
    private static final Path WORKSPACE = Paths.get("./workspace");
    private static final Path INBOX = WORKSPACE.resolve("inbox.md");
    private static final Path INPUT = WORKSPACE.resolve("input.md");
    private static final Path OUTPUT = WORKSPACE.resolve("output.md");
    private static final Path SCRATCHPAD = WORKSPACE.resolve("scratchpad.md");
    private static final Path CONVERSATION = WORKSPACE.resolve("conversation.json");
    private static final Path EXCHANGE = WORKSPACE.resolve("exchange.json");
    private static final Path ARCHIVE = WORKSPACE.resolve("archive");
    
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy_MM_dd___HH_mm");
    private static final String AI_END_MARKER = "====AI_END====";
    
    public static void main(String[] args) {
        // Ensure workspace and archive directories exist
        try {
            Files.createDirectories(WORKSPACE);
            Files.createDirectories(ARCHIVE);
            
            // Initialize conversation.json and exchange.json if they don't exist
            if (!Files.exists(CONVERSATION)) {
                Files.write(CONVERSATION, "[]".getBytes());
            }
            if (!Files.exists(EXCHANGE)) {
                Files.write(EXCHANGE, "[]".getBytes());
            }
        } catch (IOException e) {
            System.err.println("Failed to create directories: " + e.getMessage());
            return;
        }
        
        System.out.println("File-based AI Chat started. Monitoring " + INBOX);
        
        // Main loop
        while (true) {
            try {
                // Check if there's a completed exchange to archive
                if (Files.exists(OUTPUT)) {
                    archiveCompletedExchange();
                }
                
                // Check for new prompt
                if (Files.exists(INBOX)) {
                    processNewPrompt();
                }
                
                // Wait 500ms before next check
                TimeUnit.MILLISECONDS.sleep(500);
            } catch (Exception e) {
                System.err.println("Error in main loop: " + e.getMessage());
                e.printStackTrace();
            }
        }
    }
    
    private static void processNewPrompt() throws IOException {
        System.out.println("New prompt detected in inbox.md");
        
        // Check if inbox.md is empty before processing
        String inboxContent = readFile(INBOX);
        if (inboxContent.trim().isEmpty()) {
            System.out.println("Empty inbox.md file, clearing and skipping...");
            Files.write(INBOX, new byte[0]);
            return;
        }
        
        // Rename inbox.md to input.md with retry for file locks
        renameWithRetry(INBOX, INPUT);
        
        // Create new empty scratchpad
        Files.write(SCRATCHPAD, new byte[0]);
        
        // Use the content we already read
        String userPrompt = inboxContent.trim();
        System.out.println("Processing prompt: " + userPrompt.substring(0, Math.min(50, userPrompt.length())) + "...");
        
        // Add user message to exchange
        List<Message> exchange = new ArrayList<>();
        exchange.add(new Message("user", userPrompt));
        saveExchange(exchange);
        
        // Get AI response with conversation history
        try {
            String fullResponse = getAIResponse();
            
            // Write response to output.md (without the end marker)
            Files.write(OUTPUT, fullResponse.getBytes());
            System.out.println("Response written to output.md");
            
        } catch (Exception e) {
            System.err.println("Error calling AI: " + e.getMessage());
            // Even on error, we might want to archive what we have
        }
    }
    
    private static String getAIResponse() throws IOException {
        StringBuilder fullResponse = new StringBuilder();
        boolean isComplete = false;
        
        while (!isComplete) {
            // Load current exchange and full conversation
            List<Message> exchange = loadExchange();
            List<Message> conversation = loadConversation();
            
            // Build the prompt with full history
            String prompt = buildPromptWithHistory(conversation, exchange);
            
            // Call AI
            String response;
            try {
                response = Automator.askAi(prompt);
            } catch (Exception e) {
                throw new IOException("Failed to call AI: " + e.getMessage(), e);
            }
            
            // Check if response ends with the marker
            if (response.endsWith(AI_END_MARKER)) {
                // Remove the marker and append
                String cleanResponse = response.substring(0, response.length() - AI_END_MARKER.length()).trim();
                fullResponse.append(cleanResponse);
                
                // Update exchange with complete response
                if (exchange.get(exchange.size() - 1).type.equals("system")) {
                    // Find the last assistant message and update it
                    for (int i = exchange.size() - 2; i >= 0; i--) {
                        if (exchange.get(i).type.equals("assistant")) {
                            exchange.get(i).content = fullResponse.toString();
                            break;
                        }
                    }
                } else {
                    // Add new assistant message
                    exchange.add(new Message("assistant", fullResponse.toString()));
                }
                saveExchange(exchange);
                isComplete = true;
            } else {
                // Response was truncated
                System.out.println("Response truncated, requesting continuation...");
                
                if (fullResponse.length() == 0) {
                    // First response
                    fullResponse.append(response);
                    exchange.add(new Message("assistant", response));
                } else {
                    // Continuation
                    fullResponse.append(response);
                    // Update the last assistant message
                    for (int i = exchange.size() - 1; i >= 0; i--) {
                        if (exchange.get(i).type.equals("assistant")) {
                            exchange.get(i).content = fullResponse.toString();
                            break;
                        }
                    }
                }
                
                // Add system message requesting continuation
                exchange.add(new Message("system", 
                    "Your response was cut short. Please continue from EXACTLY where you left off " +
                    "so we can concatenate the responses. Do not repeat any content. End with " + AI_END_MARKER));
                saveExchange(exchange);
            }
        }
        
        return fullResponse.toString();
    }
    
    private static String buildPromptWithHistory(List<Message> conversation, List<Message> exchange) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("Here is our conversation history:\n\n");
        
        // Add all conversation messages
        for (Message msg : conversation) {
            prompt.append(Character.toUpperCase(msg.type.charAt(0)))
                  .append(msg.type.substring(1))
                  .append(": ")
                  .append(msg.content)
                  .append("\n\n");
        }
        
        // Add current exchange messages
        for (Message msg : exchange) {
            prompt.append(Character.toUpperCase(msg.type.charAt(0)))
                  .append(msg.type.substring(1))
                  .append(": ")
                  .append(msg.content)
                  .append("\n\n");
        }
        
        prompt.append("Please generate the next assistant message. End your response with ")
              .append(AI_END_MARKER)
              .append(" to indicate completion.");
        
        return prompt.toString();
    }
    
    private static void archiveCompletedExchange() throws IOException {
        System.out.println("Archiving completed exchange...");
        
        // Read files for summary
        String inputContent = readFile(INPUT);
        String scratchpadContent = readFile(SCRATCHPAD);
        
        // Get 5-word summary from AI
        String summaryPrompt = String.format(
            "Summarize in 5 words or less separated by spaces (output only the summary, nothing else):\n\n" +
            "INPUT:\n%s\n\nSCRATCHPAD:\n%s",
            inputContent, scratchpadContent
        );
        
        String summary = "unknown_summary";
        try {
            summary = Automator.askAi(summaryPrompt).trim().replaceAll("\\s+", "_");
            // Ensure summary is max 5 words
            String[] words = summary.split("_");
            if (words.length > 5) {
                summary = String.join("_", Arrays.copyOfRange(words, 0, 5));
            }
        } catch (Exception e) {
            System.err.println("Failed to get summary: " + e.getMessage());
        }
        
        // Create archive folder name
        String timestamp = LocalDateTime.now().format(DATE_FORMAT);
        String folderName = timestamp + "__" + summary;
        Path archiveFolder = ARCHIVE.resolve(folderName);
        
        // Create archive folder
        Files.createDirectories(archiveFolder);
        
        // Move files to archive
        moveFileIfExists(INPUT, archiveFolder.resolve("input.md"));
        moveFileIfExists(SCRATCHPAD, archiveFolder.resolve("scratchpad.md"));
        moveFileIfExists(OUTPUT, archiveFolder.resolve("output.md"));
        
        // Move exchange messages to conversation with archive ID
        List<Message> exchange = loadExchange();
        List<Message> conversation = loadConversation();
        
        for (Message msg : exchange) {
            msg.id = folderName; // Add archive folder name as ID
            conversation.add(msg);
        }
        
        saveConversation(conversation);
        
        // Clear exchange.json
        Files.write(EXCHANGE, "[]".getBytes());
        
        System.out.println("Archived to: " + archiveFolder.getFileName());
    }
    
    private static void renameWithRetry(Path source, Path target) throws IOException {
        int maxRetries = 10;
        int retryDelay = 100; // ms
        
        for (int i = 0; i < maxRetries; i++) {
            try {
                Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
                return;
            } catch (IOException e) {
                if (i == maxRetries - 1) {
                    throw e; // Last attempt failed
                }
                System.out.println("File locked, retrying... (" + (i + 1) + "/" + maxRetries + ")");
                try {
                    TimeUnit.MILLISECONDS.sleep(retryDelay);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new IOException("Interrupted while waiting for file", ie);
                }
            }
        }
    }
    
    private static void moveFileIfExists(Path source, Path target) throws IOException {
        if (Files.exists(source)) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }
    
    private static String readFile(Path file) throws IOException {
        if (!Files.exists(file)) {
            return "";
        }
        return new String(Files.readAllBytes(file));
    }
    
    // Simple JSON handling for messages
    private static List<Message> loadConversation() throws IOException {
        return loadMessages(CONVERSATION);
    }
    
    private static List<Message> loadExchange() throws IOException {
        return loadMessages(EXCHANGE);
    }
    
    private static List<Message> loadMessages(Path file) throws IOException {
        String json = readFile(file);
        List<Message> messages = new ArrayList<>();
        
        // Simple JSON parsing (you might want to use a JSON library for production)
        json = json.trim();
        if (json.equals("[]")) {
            return messages;
        }
        
        // Remove outer brackets and split by "},{"
        json = json.substring(1, json.length() - 1);
        if (!json.isEmpty()) {
            String[] entries = json.split("\\},\\s*\\{");
            for (String entry : entries) {
                entry = entry.replace("{", "").replace("}", "");
                String type = null;
                String content = null;
                String id = null;
                
                // Parse fields
                String[] fields = entry.split("\",\"");
                for (String field : fields) {
                    field = field.replace("\"", "");
                    if (field.startsWith("type:")) {
                        type = field.substring(5);
                    } else if (field.startsWith("content:")) {
                        content = field.substring(8);
                        // Unescape JSON string
                        content = content.replace("\\n", "\n")
                                       .replace("\\\"", "\"")
                                       .replace("\\\\", "\\");
                    } else if (field.startsWith("id:")) {
                        id = field.substring(3);
                    }
                }
                
                if (type != null && content != null) {
                    Message msg = new Message(type, content);
                    msg.id = id;
                    messages.add(msg);
                }
            }
        }
        
        return messages;
    }
    
    private static void saveConversation(List<Message> messages) throws IOException {
        saveMessages(CONVERSATION, messages);
    }
    
    private static void saveExchange(List<Message> messages) throws IOException {
        saveMessages(EXCHANGE, messages);
    }
    
    private static void saveMessages(Path file, List<Message> messages) throws IOException {
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < messages.size(); i++) {
            if (i > 0) json.append(",");
            json.append("\n  {");
            if (messages.get(i).id != null) {
                json.append("\"id\":\"").append(messages.get(i).id).append("\",");
            }
            json.append("\"type\":\"").append(messages.get(i).type).append("\",");
            json.append("\"content\":\"").append(escapeJson(messages.get(i).content)).append("\"");
            json.append("}");
        }
        json.append("\n]");
        
        Files.write(file, json.toString().getBytes());
    }
    
    private static String escapeJson(String text) {
        return text.replace("\\", "\\\\")
                   .replace("\"", "\\\"")
                   .replace("\n", "\\n")
                   .replace("\r", "\\r")
                   .replace("\t", "\\t");
    }
    
    // Simple message class
    static class Message {
        String type;
        String content;
        String id; // Archive folder name
        
        Message(String type, String content) {
            this.type = type;
            this.content = content;
        }
    }
}
