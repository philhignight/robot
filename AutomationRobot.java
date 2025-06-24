import java.awt.*;
import java.awt.datatransfer.*;
import java.awt.event.InputEvent;
import java.awt.event.KeyEvent;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import javax.imageio.ImageIO;
import javax.swing.*;
import org.json.*;

public class AutomationRobot {
    private Robot robot;
    private Clipboard clipboard;
    private static final String INPUT_FILE = "input.txt";
    private static final String OUTPUT_FILE = "output.txt";
    private JFrame overlay;
    private JLabel overlayLabel;
    
    public AutomationRobot() throws AWTException {
        this.robot = new Robot();
        this.clipboard = Toolkit.getDefaultToolkit().getSystemClipboard();
        robot.setAutoDelay(50); // Small delay between actions
        initOverlay();
    }
    
    private void initOverlay() {
        overlay = new JFrame();
        overlay.setUndecorated(true);
        overlay.setAlwaysOnTop(true);
        overlay.setDefaultCloseOperation(JFrame.DO_NOTHING_ON_CLOSE);
        overlay.setBackground(new Color(0, 0, 0, 0));
        overlay.setType(Window.Type.UTILITY);
        
        overlayLabel = new JLabel("", SwingConstants.CENTER);
        overlayLabel.setFont(new Font("Arial", Font.BOLD, 72));
        overlayLabel.setForeground(Color.RED);
        
        JPanel panel = new JPanel() {
            @Override
            protected void paintComponent(Graphics g) {
                super.paintComponent(g);
                // Add semi-transparent background
                g.setColor(new Color(0, 0, 0, 180));
                g.fillRect(0, 0, getWidth(), getHeight());
            }
        };
        panel.setOpaque(false);
        panel.setLayout(new BorderLayout());
        panel.add(overlayLabel, BorderLayout.CENTER);
        
        overlay.setContentPane(panel);
        overlay.setSize(400, 200);
        
        // Center on screen
        Dimension screenSize = Toolkit.getDefaultToolkit().getScreenSize();
        overlay.setLocation(
            (screenSize.width - overlay.getWidth()) / 2,
            (screenSize.height - overlay.getHeight()) / 2
        );
    }
    
    private void showOverlay(String text, int duration) {
        SwingUtilities.invokeLater(() -> {
            overlayLabel.setText(text);
            overlay.setVisible(true);
        });
        
        if (duration > 0) {
            new Thread(() -> {
                try {
                    Thread.sleep(duration);
                    hideOverlay();
                } catch (InterruptedException e) {
                    // Ignore
                }
            }).start();
        }
    }
    
    private void hideOverlay() {
        SwingUtilities.invokeLater(() -> {
            overlay.setVisible(false);
        });
    }
    
    public void run() {
        System.out.println("Automation Robot started. Watching for commands...");
        System.out.println("Looking for input file: " + new File(INPUT_FILE).getAbsolutePath());
        
        File inputFile = new File(INPUT_FILE);
        long lastModified = 0;
        
        while (true) {
            try {
                if (inputFile.exists() && inputFile.lastModified() > lastModified) {
                    lastModified = inputFile.lastModified();
                    
                    String content = new String(Files.readAllBytes(inputFile.toPath()));
                    if (!content.trim().isEmpty()) {
                        System.out.println("Received command: " + content);
                        JSONObject command = new JSONObject(content);
                        JSONObject result = executeCommand(command);
                        
                        System.out.println("Writing response: " + result.toString());
                        Files.write(Paths.get(OUTPUT_FILE), 
                                   result.toString().getBytes(), 
                                   StandardOpenOption.CREATE, 
                                   StandardOpenOption.TRUNCATE_EXISTING);
                        
                        // Clear input file
                        Files.write(inputFile.toPath(), "".getBytes());
                    }
                }
                
                Thread.sleep(100); // Poll every 100ms
            } catch (Exception e) {
                System.err.println("Error in main loop: " + e.getMessage());
                e.printStackTrace();
                writeError(e.getMessage());
            }
        }
    }
    
    private JSONObject executeCommand(JSONObject command) {
        JSONObject result = new JSONObject();
        
        try {
            String action = command.getString("action");
            
            switch (action) {
                case "click":
                    int x = command.getInt("x");
                    int y = command.getInt("y");
                    boolean doubleClick = command.optBoolean("doubleClick", false);
                    
                    robot.mouseMove(x, y);
                    robot.mousePress(InputEvent.BUTTON1_DOWN_MASK);
                    robot.mouseRelease(InputEvent.BUTTON1_DOWN_MASK);
                    
                    if (doubleClick) {
                        robot.delay(100);
                        robot.mousePress(InputEvent.BUTTON1_DOWN_MASK);
                        robot.mouseRelease(InputEvent.BUTTON1_DOWN_MASK);
                    }
                    
                    result.put("success", true);
                    break;
                    
                case "type":
                    String text = command.getString("text");
                    typeString(text);
                    result.put("success", true);
                    break;
                    
                case "key":
                    String keys = command.getString("keys");
                    pressKeys(keys);
                    result.put("success", true);
                    break;
                    
                case "copy":
                    robot.keyPress(KeyEvent.VK_CONTROL);
                    robot.keyPress(KeyEvent.VK_C);
                    robot.keyRelease(KeyEvent.VK_C);
                    robot.keyRelease(KeyEvent.VK_CONTROL);
                    robot.delay(100); // Give system time to copy
                    
                    String copiedText = getClipboardText();
                    result.put("success", true);
                    result.put("clipboard", copiedText);
                    break;
                    
                case "paste":
                    robot.keyPress(KeyEvent.VK_CONTROL);
                    robot.keyPress(KeyEvent.VK_V);
                    robot.keyRelease(KeyEvent.VK_V);
                    robot.keyRelease(KeyEvent.VK_CONTROL);
                    result.put("success", true);
                    break;
                    
                case "screenshot":
                    String filename = command.getString("filename");
                    takeScreenshot(filename);
                    result.put("success", true);
                    break;
                    
                case "scroll":
                    int scrollAmount = command.getInt("amount");
                    robot.mouseWheel(scrollAmount);
                    result.put("success", true);
                    break;
                    
                case "getMousePosition":
                    Point mousePos = MouseInfo.getPointerInfo().getLocation();
                    result.put("success", true);
                    result.put("x", mousePos.x);
                    result.put("y", mousePos.y);
                    break;
                    
                case "showOverlay":
                    String overlayText = command.getString("text");
                    int duration = command.optInt("duration", 0);
                    showOverlay(overlayText, duration);
                    result.put("success", true);
                    break;
                    
                case "hideOverlay":
                    hideOverlay();
                    result.put("success", true);
                    break;
                    
                default:
                    result.put("success", false);
                    result.put("error", "Unknown action: " + action);
            }
            
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
        }
        
        return result;
    }
    
    private void typeString(String text) {
        for (char c : text.toCharArray()) {
            int keyCode = KeyEvent.getExtendedKeyCodeForChar(c);
            if (KeyEvent.CHAR_UNDEFINED == keyCode) {
                continue;
            }
            
            boolean needShift = Character.isUpperCase(c) || "!@#$%^&*()_+{}|:\"<>?".indexOf(c) != -1;
            
            if (needShift) {
                robot.keyPress(KeyEvent.VK_SHIFT);
            }
            
            robot.keyPress(keyCode);
            robot.keyRelease(keyCode);
            
            if (needShift) {
                robot.keyRelease(KeyEvent.VK_SHIFT);
            }
        }
    }
    
    private void pressKeys(String keys) {
        String[] parts = keys.toLowerCase().split("\\+");
        int[] keyCodes = new int[parts.length];
        
        for (int i = 0; i < parts.length; i++) {
            switch (parts[i]) {
                case "ctrl":
                case "control":
                    keyCodes[i] = KeyEvent.VK_CONTROL;
                    break;
                case "alt":
                    keyCodes[i] = KeyEvent.VK_ALT;
                    break;
                case "shift":
                    keyCodes[i] = KeyEvent.VK_SHIFT;
                    break;
                case "enter":
                    keyCodes[i] = KeyEvent.VK_ENTER;
                    break;
                case "tab":
                    keyCodes[i] = KeyEvent.VK_TAB;
                    break;
                case "esc":
                case "escape":
                    keyCodes[i] = KeyEvent.VK_ESCAPE;
                    break;
                case "space":
                    keyCodes[i] = KeyEvent.VK_SPACE;
                    break;
                case "backspace":
                    keyCodes[i] = KeyEvent.VK_BACK_SPACE;
                    break;
                case "delete":
                    keyCodes[i] = KeyEvent.VK_DELETE;
                    break;
                case "up":
                    keyCodes[i] = KeyEvent.VK_UP;
                    break;
                case "down":
                    keyCodes[i] = KeyEvent.VK_DOWN;
                    break;
                case "left":
                    keyCodes[i] = KeyEvent.VK_LEFT;
                    break;
                case "right":
                    keyCodes[i] = KeyEvent.VK_RIGHT;
                    break;
                case "home":
                    keyCodes[i] = KeyEvent.VK_HOME;
                    break;
                case "end":
                    keyCodes[i] = KeyEvent.VK_END;
                    break;
                case "pageup":
                    keyCodes[i] = KeyEvent.VK_PAGE_UP;
                    break;
                case "pagedown":
                    keyCodes[i] = KeyEvent.VK_PAGE_DOWN;
                    break;
                default:
                    if (parts[i].length() == 1) {
                        keyCodes[i] = KeyEvent.getExtendedKeyCodeForChar(parts[i].charAt(0));
                    } else if (parts[i].startsWith("f") && parts[i].length() <= 3) {
                        int fNum = Integer.parseInt(parts[i].substring(1));
                        keyCodes[i] = KeyEvent.VK_F1 + (fNum - 1);
                    }
            }
        }
        
        // Press all keys
        for (int keyCode : keyCodes) {
            robot.keyPress(keyCode);
        }
        
        // Release all keys in reverse order
        for (int i = keyCodes.length - 1; i >= 0; i--) {
            robot.keyRelease(keyCodes[i]);
        }
    }
    
    private String getClipboardText() {
        try {
            Transferable contents = clipboard.getContents(null);
            if (contents != null && contents.isDataFlavorSupported(DataFlavor.stringFlavor)) {
                return (String) contents.getTransferData(DataFlavor.stringFlavor);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "";
    }
    
    private void takeScreenshot(String filename) throws IOException {
        Rectangle screenRect = new Rectangle(Toolkit.getDefaultToolkit().getScreenSize());
        BufferedImage capture = robot.createScreenCapture(screenRect);
        ImageIO.write(capture, "png", new File(filename));
    }
    
    private void writeError(String error) {
        try {
            JSONObject result = new JSONObject();
            result.put("success", false);
            result.put("error", error);
            
            Files.write(Paths.get(OUTPUT_FILE), 
                       result.toString().getBytes(), 
                       StandardOpenOption.CREATE, 
                       StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
    
    public static void main(String[] args) {
        try {
            AutomationRobot robot = new AutomationRobot();
            
            // Add shutdown hook to clean up overlay
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                robot.hideOverlay();
            }));
            
            robot.run();
        } catch (AWTException e) {
            System.err.println("Failed to create Robot: " + e.getMessage());
            System.exit(1);
        }
    }
}