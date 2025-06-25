import java.io.*;
import java.nio.file.*;
import java.util.*;

/**
 * Strips HTML tags from text using HtmlParser, leaving only the text content.
 * Handles special cases like preserving spacing and handling block elements.
 */
public class HtmlStripper {
    private boolean preserveLinks = false;
    private boolean normalizeWhitespace = true;
    private Set<String> blockElements;
    
    public HtmlStripper() {
        initBlockElements();
    }
    
    /**
     * Strip HTML tags from the input string
     */
    public String stripHtml(String html) {
        if (html == null || html.trim().isEmpty()) {
            return "";
        }
        
        HtmlParser parser = new HtmlParser(html);
        HtmlParser.HtmlNode root = parser.parse();
        
        String text = extractText(root);
        
        if (normalizeWhitespace) {
            // Clean up excessive whitespace
            text = text.replaceAll("\\s+", " ");
            text = text.replaceAll("\\s*\n\\s*\n\\s*", "\n\n");
            text = text.trim();
        }
        
        return text;
    }
    
    /**
     * Strip HTML from file
     */
    public void stripFile(String inputPath, String outputPath) throws IOException {
        String html = new String(Files.readAllBytes(Paths.get(inputPath)));
        String text = stripHtml(html);
        Files.write(Paths.get(outputPath), text.getBytes());
    }
    
    /**
     * Enable or disable link preservation
     * When enabled, links are shown as "text (url)"
     */
    public void setPreserveLinks(boolean preserve) {
        this.preserveLinks = preserve;
    }
    
    /**
     * Enable or disable whitespace normalization
     */
    public void setNormalizeWhitespace(boolean normalize) {
        this.normalizeWhitespace = normalize;
    }
    
    private void initBlockElements() {
        blockElements = new HashSet<>(Arrays.asList(
            "address", "article", "aside", "blockquote", "details", "dialog",
            "dd", "div", "dl", "dt", "fieldset", "figcaption", "figure",
            "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
            "header", "hgroup", "hr", "li", "main", "nav", "ol", "p",
            "pre", "section", "table", "ul", "tr", "td", "th"
        ));
    }
    
    private String extractText(HtmlParser.HtmlNode node) {
        return extractText(node, new StringBuilder()).toString();
    }
    
    private StringBuilder extractText(HtmlParser.HtmlNode node, StringBuilder sb) {
        if (node.isText()) {
            sb.append(node.getText());
            return sb;
        }
        
        // Skip hidden elements
        if (isHidden(node)) {
            return sb;
        }
        
        String tagName = node.getTagName();
        
        // Skip script, style, and noscript content
        if (tagName != null && (tagName.equals("script") || tagName.equals("style") || 
            tagName.equals("noscript"))) {
            return sb;
        }
        
        // Add space before block elements if needed
        if (tagName != null && blockElements.contains(tagName) && sb.length() > 0) {
            char lastChar = sb.charAt(sb.length() - 1);
            if (lastChar != '\n' && lastChar != ' ') {
                sb.append("\n");
            }
        }
        
        // Special handling for br tags
        if (tagName != null && tagName.equals("br")) {
            sb.append("\n");
            return sb;
        }
        
        // Special handling for list items
        if (tagName != null && tagName.equals("li")) {
            sb.append("• ");
        }
        
        // Process children
        for (HtmlParser.HtmlNode child : node.getChildren()) {
            extractText(child, sb);
        }
        
        // Special handling for links if preserveLinks is enabled
        if (preserveLinks && tagName != null && tagName.equals("a")) {
            String href = node.getAttribute("href");
            if (href != null && !href.isEmpty() && !href.startsWith("#")) {
                sb.append(" (").append(href).append(")");
            }
        }
        
        // Add space after block elements
        if (tagName != null && blockElements.contains(tagName)) {
            if (sb.length() > 0 && sb.charAt(sb.length() - 1) != '\n') {
                sb.append("\n");
            }
        }
        
        // Add space after inline elements that typically need spacing
        if (tagName != null && (tagName.equals("td") || tagName.equals("th"))) {
            sb.append(" ");
        }
        
        return sb;
    }
    
    private boolean isHidden(HtmlParser.HtmlNode node) {
        if (node.hasAttribute("hidden")) {
            return true;
        }
        
        String style = node.getAttribute("style");
        if (style != null) {
            style = style.toLowerCase();
            if (style.contains("display:none") || style.contains("display: none") ||
                style.contains("visibility:hidden") || style.contains("visibility: hidden")) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Utility method to strip HTML with custom options
     */
    public static String strip(String html, boolean preserveLinks, boolean normalizeWhitespace) {
        HtmlStripper stripper = new HtmlStripper();
        stripper.setPreserveLinks(preserveLinks);
        stripper.setNormalizeWhitespace(normalizeWhitespace);
        return stripper.stripHtml(html);
    }
    
    /**
     * Quick strip with default options
     */
    public static String strip(String html) {
        return new HtmlStripper().stripHtml(html);
    }
    
    // Main method for command-line usage
    public static void main(String[] args) {
        if (args.length < 1) {
            System.out.println("Usage: java HtmlStripper <input.html> [output.txt] [options]");
            System.out.println("Options:");
            System.out.println("  --preserve-links    Show URLs after link text");
            System.out.println("  --no-normalize      Don't normalize whitespace");
            System.out.println("\nIf output file is not specified, prints to stdout");
            System.exit(1);
        }
        
        try {
            HtmlStripper stripper = new HtmlStripper();
            String inputPath = args[0];
            String outputPath = null;
            
            // Parse options
            for (int i = 1; i < args.length; i++) {
                if (args[i].equals("--preserve-links")) {
                    stripper.setPreserveLinks(true);
                } else if (args[i].equals("--no-normalize")) {
                    stripper.setNormalizeWhitespace(false);
                } else if (!args[i].startsWith("--")) {
                    outputPath = args[i];
                }
            }
            
            if (outputPath != null) {
                stripper.stripFile(inputPath, outputPath);
                System.out.println("Stripped HTML from " + inputPath + " to " + outputPath);
            } else {
                String html = new String(Files.readAllBytes(Paths.get(inputPath)));
                String text = stripper.stripHtml(html);
                System.out.println(text);
            }
        } catch (IOException e) {
            System.err.println("Error: " + e.getMessage());
            System.exit(1);
        }
    }
}
