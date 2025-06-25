import java.io.*;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.TimeUnit;

public class FileBasedAIChat {
    private static final Path WORKSPACE = Paths.get("./workspace");
    private static final Path INBOX = WORKSPACE.resolve("inbox.md");
    private static final Path INPUT = WORKSPACE.resolve("input.md");
    private static final Path OUTPUT = WORKSPACE.resolve("output.md");
    private static final Path SCRATCHPAD = WORKSPACE.resolve("scratchpad.md");
    private static final Path ARCHIVE = WORKSPACE.resolve("archive");
    
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy_MM_dd___HH_mm");
    
    public static void main(String[] args) {
        // Ensure workspace and archive directories exist
        try {
            Files.createDirectories(WORKSPACE);
            Files.createDirectories(ARCHIVE);
        } catch (IOException e) {
            System.err.println("Failed to create directories: " + e.getMessage());
            return;
        }
        
        System.out.println("File-based AI Chat started. Monitoring " + INBOX);
        
        // Main loop
        while (true) {
            try {
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
        
        // Archive previous run if it exists
        if (Files.exists(INPUT)) {
            archivePreviousRun();
        }
        
        // Rename inbox.md to input.md with retry for file locks
        renameWithRetry(INBOX, INPUT);
        
        // Create new empty scratchpad
        Files.write(SCRATCHPAD, new byte[0]);
        
        // Read the prompt from input.md
        String prompt = readFile(INPUT);
        if (prompt.isEmpty()) {
            System.out.println("Empty prompt file, skipping...");
            return;
        }
        
        System.out.println("Processing prompt: " + prompt.substring(0, Math.min(50, prompt.length())) + "...");
        
        // Send to AI
        try {
            String response = Automator.askAi(prompt);
            
            // Write response to output.md
            Files.write(OUTPUT, response.getBytes());
            System.out.println("Response written to output.md");
            
        } catch (Exception e) {
            System.err.println("Error calling AI: " + e.getMessage());
            // Even on error, we continue - the archive process will handle it
        }
    }
    
    private static void archivePreviousRun() throws IOException {
        System.out.println("Archiving previous run...");
        
        // Determine if this was an error run
        boolean isError = !Files.exists(OUTPUT);
        
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
                summary = String.join("_", java.util.Arrays.copyOfRange(words, 0, 5));
            }
        } catch (Exception e) {
            System.err.println("Failed to get summary: " + e.getMessage());
        }
        
        // Create archive folder name
        String timestamp = LocalDateTime.now().format(DATE_FORMAT);
        String folderName = timestamp + "__" + (isError ? "ERROR_" : "") + summary;
        Path archiveFolder = ARCHIVE.resolve(folderName);
        
        // Create archive folder
        Files.createDirectories(archiveFolder);
        
        // Move files to archive
        moveFileIfExists(INPUT, archiveFolder.resolve("input.md"));
        moveFileIfExists(SCRATCHPAD, archiveFolder.resolve("scratchpad.md"));
        if (!isError) {
            moveFileIfExists(OUTPUT, archiveFolder.resolve("output.md"));
        }
        
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
}
