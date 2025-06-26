import java.io.*;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

public class NodeProcessLauncher {
    // Pattern to match - customize this as needed
    private static final Pattern PATTERN = Pattern.compile("\\[PROCESS\\](.*)");
    
    public static void main(String[] args) {
        try {
            // Get the current directory
            String currentDir = System.getProperty("user.dir");
            
            // JavaScript file name in same folder
            String jsFileName = "script.js";
            
            // Create ProcessBuilder
            ProcessBuilder processBuilder = new ProcessBuilder("node", jsFileName);
            processBuilder.directory(new File(currentDir));
            
            // Start the process
            Process nodeProcess = processBuilder.start();
            
            System.out.println("Node.js process started. PID: " + nodeProcess.pid());
            
            // Thread to forward stdin to Node.js
            Thread stdinForwarder = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
                     BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(nodeProcess.getOutputStream()))) {
                    
                    String line;
                    while ((line = reader.readLine()) != null) {
                        writer.write(line);
                        writer.newLine();
                        writer.flush();
                    }
                } catch (IOException e) {
                    // Input stream closed
                }
            });
            stdinForwarder.setDaemon(true);
            stdinForwarder.start();
            
            // Thread to process stdout from Node.js
            Thread stdoutProcessor = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(nodeProcess.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        // Check if line matches our pattern
                        Matcher matcher = PATTERN.matcher(line);
                        if (matcher.find()) {
                            // Extract the matched content and process it
                            String matchedContent = matcher.group(1);
                            processSpecialLine(matchedContent);
                        } else {
                            // Forward to stdout
                            System.out.println(line);
                        }
                    }
                } catch (IOException e) {
                    // Output stream closed
                }
            });
            stdoutProcessor.start();
            
            // Thread to forward stderr to System.err
            Thread stderrForwarder = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(nodeProcess.getErrorStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        System.err.println(line);
                    }
                } catch (IOException e) {
                    // Error stream closed
                }
            });
            stderrForwarder.start();
            
            // Wait for Node.js process to complete
            int exitCode = nodeProcess.waitFor();
            
            // Wait for output processing to complete
            stdoutProcessor.join(1000);
            stderrForwarder.join(1000);
            
            System.out.println("\nNode.js process exited with code: " + exitCode);
            
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * Fake process method called when a line matches the pattern
     * @param content The content extracted from the matched line
     */
    private static void processSpecialLine(String content) {
        System.out.println("*** PROCESSING SPECIAL LINE: " + content.trim() + " ***");
        // Add your custom processing logic here
        // For example:
        // - Parse JSON
        // - Update internal state
        // - Trigger other actions
        // - Write to a file
        // etc.
    }
}
