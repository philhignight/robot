import java.io.*;
import java.nio.file.*;
import java.util.*;

/**
 * Converts HTML to AI-readable Markdown format using HtmlParser.
 * Preserves semantic structure and provides context for interactive elements.
 */
public class HtmlToMarkdownConverter {
    private int indentLevel = 0;
    private List<Integer> listCounters = new ArrayList<>();
    private boolean inPre = false;
    
    /**
     * Convert HTML string to Markdown
     */
    public String convert(String html) {
        HtmlParser parser = new HtmlParser(html);
        HtmlParser.HtmlNode root = parser.parse();
        
        String markdown = processNode(root);
        
        // Clean up excessive newlines
        return markdown.trim().replaceAll("\n{3,}", "\n\n");
    }
    
    /**
     * Convert HTML file to Markdown file
     */
    public void convertFile(String inputPath, String outputPath) throws IOException {
        String html = new String(Files.readAllBytes(Paths.get(inputPath)));
        String markdown = convert(html);
        Files.write(Paths.get(outputPath), markdown.getBytes());
    }
    
    private String processNode(HtmlParser.HtmlNode node) {
        return processNode(node, false);
    }
    
    private String processNode(HtmlParser.HtmlNode node, boolean skipIndent) {
        if (node.isText()) {
            String text = inPre ? node.getText() : node.getText().replaceAll("\\s+", " ").trim();
            if (text.isEmpty()) return "";
            return skipIndent ? text : getIndent() + text;
        }
        
        if (isHidden(node)) return "";
        
        return processElement(node, skipIndent);
    }
    
    private String processElement(HtmlParser.HtmlNode element, boolean skipIndent) {
        if (element.getTagName() == null || element.getTagName().equals("root")) {
            return processChildrenBlock(element, false);
        }
        
        String indent = skipIndent ? "" : getIndent();
        String tagName = element.getTagName();
        
        // Skip script, style, noscript
        if (tagName.equals("script") || tagName.equals("style") || tagName.equals("noscript")) {
            return "";
        }
        
        switch (tagName) {
            // Headings
            case "h1": return indent + "# " + getTextContent(element) + "\n";
            case "h2": return indent + "## " + getTextContent(element) + "\n";
            case "h3": return indent + "### " + getTextContent(element) + "\n";
            case "h4": return indent + "#### " + getTextContent(element) + "\n";
            case "h5": return indent + "##### " + getTextContent(element) + "\n";
            case "h6": return indent + "###### " + getTextContent(element) + "\n";
            
            // Text formatting
            case "strong":
            case "b": return "**" + processChildrenInline(element) + "**";
            case "em":
            case "i": return "*" + processChildrenInline(element) + "*";
            case "code":
                HtmlParser.HtmlNode parent = getParentInContext(element);
                if (parent != null && parent.getTagName() != null && parent.getTagName().equals("pre")) {
                    return element.getTextContent();
                }
                return "`" + element.getTextContent() + "`";
            
            case "p":
                String pContent = processChildrenInline(element);
                return pContent.isEmpty() ? "" : indent + pContent + "\n";
            
            case "pre":
                inPre = true;
                String preContent = processChildrenInline(element);
                inPre = false;
                return indent + "```\n" + preContent + "\n" + indent + "```\n";
            
            case "blockquote":
                return indent + "> " + processChildrenInline(element) + "\n";
            
            case "hr": return indent + "---\n";
            case "br": return "\n";
            
            // Links and images
            case "a":
                String href = element.getAttribute("href");
                String linkText = getTextContent(element);
                return href != null && !href.isEmpty() ? "[" + linkText + "](" + href + ")" : linkText;
            
            case "img":
                String alt = element.getAttribute("alt");
                if (alt == null || alt.isEmpty()) alt = "image";
                return "![" + alt + "]";
            
            // Lists
            case "ul":
            case "ol":
                listCounters.add(0);
                String listResult = processListItems(element);
                listCounters.remove(listCounters.size() - 1);
                return listResult;
            
            // Forms
            case "button":
                return indent + "[Button: " + getTextContent(element) + "]\n";
            
            case "input":
                return processInput(element, indent);
            
            case "textarea":
                String placeholder = element.getAttribute("placeholder");
                if (placeholder == null || placeholder.isEmpty()) {
                    placeholder = element.getAttribute("name");
                }
                if (placeholder == null || placeholder.isEmpty()) {
                    placeholder = "text";
                }
                return indent + "[Textarea: " + placeholder + "]\n";
            
            case "select":
                HtmlParser.HtmlNode selected = findSelectedOption(element);
                String optionText = selected != null ? selected.getTextContent().trim() : "options";
                return indent + "[Select: " + optionText + "]\n";
            
            // Tables
            case "table":
                return processTable(element, indent);
            
            // Semantic sections
            case "header":
                return indent + "[Header]\n" + processChildrenBlock(element, true);
            case "nav":
                return indent + "[Navigation]\n" + processChildrenBlock(element, true);
            case "main":
                return indent + "[Main Content]\n" + processChildrenBlock(element, true);
            case "aside":
                return indent + "[Sidebar]\n" + processChildrenBlock(element, true);
            case "footer":
                return indent + "[Footer]\n" + processChildrenBlock(element, true);
            case "form":
                return processChildrenBlock(element, shouldPreserveHierarchy(element));
            
            // Default handling
            default:
                if (shouldPreserveHierarchy(element)) {
                    return processChildrenBlock(element, true);
                } else {
                    return processChildrenBlock(element, false);
                }
        }
    }
    
    private String processInput(HtmlParser.HtmlNode element, String indent) {
        String type = element.getAttribute("type");
        if (type == null) type = "text";
        
        String name = element.getAttribute("name");
        String placeholder = element.getAttribute("placeholder");
        String value = element.getAttribute("value");
        boolean checked = element.hasAttribute("checked");
        String label = placeholder != null ? placeholder : (name != null ? name : (value != null ? value : type));
        
        switch (type.toLowerCase()) {
            case "button":
            case "submit":
                return indent + "[" + (type.equals("submit") ? "Submit" : "Button") + ": " + 
                       (value != null ? value : "Submit") + "]\n";
            case "checkbox":
                return indent + (checked ? "[x]" : "[ ]");
            case "radio":
                return indent + (checked ? "(•)" : "( )");
            case "hidden":
                return ""; // Skip hidden inputs
            case "text":
            case "email":
            case "password":
            case "search":
            case "tel":
            case "url":
                return indent + "[Input: " + label + "]\n";
            default:
                return indent + "[Input: " + label + "]\n";
        }
    }
    
    private String processTable(HtmlParser.HtmlNode table, String indent) {
        List<String> rows = new ArrayList<>();
        List<HtmlParser.HtmlNode> allRows = table.querySelectorAll("tr");
        
        if (allRows.isEmpty()) return "";
        
        for (HtmlParser.HtmlNode row : allRows) {
            List<HtmlParser.HtmlNode> cells = new ArrayList<>();
            cells.addAll(row.querySelectorAll("th"));
            cells.addAll(row.querySelectorAll("td"));
            
            if (cells.isEmpty()) continue;
            
            List<String> cellContents = new ArrayList<>();
            for (HtmlParser.HtmlNode cell : cells) {
                cellContents.add(getTextContent(cell).trim());
            }
            
            rows.add(indent + "| " + String.join(" | ", cellContents) + " |");
        }
        
        return String.join("\n", rows) + "\n";
    }
    
    private String processListItems(HtmlParser.HtmlNode listElement) {
        StringBuilder result = new StringBuilder();
        boolean isOrdered = listElement.getTagName().equals("ol");
        int counter = 0;
        
        for (HtmlParser.HtmlNode child : listElement.getChildren()) {
            if (child.isText()) continue;
            if (!child.getTagName().equals("li")) continue;
            
            String indent = getIndent();
            if (isOrdered) {
                counter++;
                result.append(indent).append(counter).append(". ");
            } else {
                result.append(indent).append("- ");
            }
            
            result.append(processChildrenInline(child)).append("\n");
        }
        
        return result.toString();
    }
    
    private String processChildrenInline(HtmlParser.HtmlNode element) {
        StringBuilder result = new StringBuilder();
        for (HtmlParser.HtmlNode child : element.getChildren()) {
            if (child.isText()) {
                String text = inPre ? child.getText() : child.getText().replaceAll("\\s+", " ");
                result.append(text);
            } else if (!isHidden(child)) {
                result.append(processNode(child, true));
            }
        }
        return result.toString().trim();
    }
    
    private String processChildrenBlock(HtmlParser.HtmlNode element, boolean preserveHierarchy) {
        StringBuilder result = new StringBuilder();
        List<HtmlParser.HtmlNode> children = element.getChildren();
        
        // Filter out empty text nodes
        List<HtmlParser.HtmlNode> meaningfulChildren = new ArrayList<>();
        for (HtmlParser.HtmlNode child : children) {
            if (child.isText() && child.getText().trim().isEmpty()) continue;
            if (!child.isText() && isHidden(child)) continue;
            meaningfulChildren.add(child);
        }
        
        if (preserveHierarchy) {
            indentLevel++;
        }
        
        for (int i = 0; i < meaningfulChildren.size(); i++) {
            HtmlParser.HtmlNode child = meaningfulChildren.get(i);
            String processed = processNode(child, false);
            if (!processed.isEmpty()) {
                result.append(processed);
                // Add newline if not already present and not last child
                if (!processed.endsWith("\n") && i < meaningfulChildren.size() - 1) {
                    result.append("\n");
                }
            }
        }
        
        if (preserveHierarchy) {
            indentLevel--;
        }
        
        return result.toString();
    }
    
    private String getIndent() {
        return "  ".repeat(indentLevel);
    }
    
    private String getTextContent(HtmlParser.HtmlNode element) {
        if (element.isText()) {
            return element.getText();
        }
        
        StringBuilder text = new StringBuilder();
        for (HtmlParser.HtmlNode child : element.getChildren()) {
            if (child.isText()) {
                text.append(child.getText());
            } else if (!isHidden(child)) {
                String tagName = child.getTagName();
                // For certain inline elements, preserve their formatting
                if (tagName != null && (tagName.equals("strong") || tagName.equals("b") || 
                    tagName.equals("em") || tagName.equals("i") || tagName.equals("code"))) {
                    text.append(processElement(child, true));
                } else {
                    text.append(getTextContent(child));
                }
            }
        }
        return text.toString().trim();
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
    
    private boolean shouldPreserveHierarchy(HtmlParser.HtmlNode node) {
        if (node.getTagName() == null) return false;
        
        // Always preserve these semantic elements
        Set<String> semanticElements = new HashSet<>(Arrays.asList(
            "nav", "header", "footer", "main", "aside", "article", "section", "form", "ul", "ol"
        ));
        if (semanticElements.contains(node.getTagName())) return true;
        
        // Get meaningful children
        List<HtmlParser.HtmlNode> meaningfulChildren = new ArrayList<>();
        for (HtmlParser.HtmlNode child : node.getChildren()) {
            if (!child.isText() || !child.getText().trim().isEmpty()) {
                if (!child.isText() && !isHidden(child)) {
                    meaningfulChildren.add(child);
                } else if (child.isText() && !child.getText().trim().isEmpty()) {
                    meaningfulChildren.add(child);
                }
            }
        }
        
        // Collapse single-child wrappers
        if (meaningfulChildren.size() <= 1) return false;
        
        // Check for grouping classes
        String className = node.getAttribute("class");
        if (className != null) {
            className = className.toLowerCase();
            List<String> groupingClasses = Arrays.asList(
                "message", "comment", "post", "item", "entry", "record", "card", "user", "author"
            );
            for (String groupClass : groupingClasses) {
                if (className.contains(groupClass)) return true;
            }
        }
        
        // Preserve if multiple children
        return meaningfulChildren.size() > 1;
    }
    
    private HtmlParser.HtmlNode findSelectedOption(HtmlParser.HtmlNode select) {
        for (HtmlParser.HtmlNode option : select.querySelectorAll("option")) {
            if (option.hasAttribute("selected")) {
                return option;
            }
        }
        // Return first option if none selected
        List<HtmlParser.HtmlNode> options = select.querySelectorAll("option");
        return options.isEmpty() ? null : options.get(0);
    }
    
    // Helper method - in real implementation, would need parent tracking
    private HtmlParser.HtmlNode getParentInContext(HtmlParser.HtmlNode node) {
        // This is a simplified version - in a real implementation,
        // you'd track parent relationships during parsing
        return null;
    }
    
    // Main method for command-line usage
    public static void main(String[] args) {
        if (args.length < 1) {
            System.out.println("Usage: java HtmlToMarkdownConverter <input.html> [output.md]");
            System.out.println("If output file is not specified, prints to stdout");
            System.exit(1);
        }
        
        try {
            HtmlToMarkdownConverter converter = new HtmlToMarkdownConverter();
            String inputPath = args[0];
            
            if (args.length >= 2) {
                String outputPath = args[1];
                converter.convertFile(inputPath, outputPath);
                System.out.println("Converted " + inputPath + " to " + outputPath);
            } else {
                String html = new String(Files.readAllBytes(Paths.get(inputPath)));
                String markdown = converter.convert(html);
                System.out.println(markdown);
            }
        } catch (IOException e) {
            System.err.println("Error: " + e.getMessage());
            System.exit(1);
        }
    }
}
