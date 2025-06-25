import java.util.*;

/**
 * A simple HTML parser with no external dependencies.
 * Parses HTML into a tree structure of HtmlNode objects.
 */
public class HtmlParser {
    private String html;
    private int pos = 0;
    
    // Token types for parsing
    enum TokenType {
        TEXT, OPEN_TAG, CLOSE_TAG, SELF_CLOSING_TAG, COMMENT, DOCTYPE, EOF
    }
    
    static class Token {
        TokenType type;
        String content;
        String tagName;
        Map<String, String> attributes;
        
        Token(TokenType type, String content) {
            this.type = type;
            this.content = content;
            this.attributes = new HashMap<>();
        }
    }
    
    /**
     * Represents an HTML node in the DOM tree
     */
    public static class HtmlNode {
        private String tagName;
        private Map<String, String> attributes;
        private List<HtmlNode> children;
        private String text;
        private boolean isText;
        
        public HtmlNode(String tagName) {
            this.tagName = tagName;
            this.attributes = new HashMap<>();
            this.children = new ArrayList<>();
            this.isText = false;
        }
        
        public static HtmlNode createTextNode(String text) {
            HtmlNode node = new HtmlNode(null);
            node.text = text;
            node.isText = true;
            return node;
        }
        
        // Getters
        public String getTagName() { return tagName; }
        public Map<String, String> getAttributes() { return attributes; }
        public List<HtmlNode> getChildren() { return children; }
        public String getText() { return text; }
        public boolean isText() { return isText; }
        
        public String getAttribute(String name) {
            return attributes.get(name);
        }
        
        public boolean hasAttribute(String name) {
            return attributes.containsKey(name);
        }
        
        /**
         * Get all text content from this node and its children
         */
        public String getTextContent() {
            if (isText) {
                return text;
            }
            
            StringBuilder sb = new StringBuilder();
            for (HtmlNode child : children) {
                sb.append(child.getTextContent());
            }
            return sb.toString();
        }
        
        /**
         * Find the first child element with the given tag name
         */
        public HtmlNode querySelector(String tagName) {
            if (!isText && this.tagName != null && this.tagName.equals(tagName)) {
                return this;
            }
            
            for (HtmlNode child : children) {
                HtmlNode found = child.querySelector(tagName);
                if (found != null) return found;
            }
            
            return null;
        }
        
        /**
         * Find all child elements with the given tag name
         */
        public List<HtmlNode> querySelectorAll(String tagName) {
            List<HtmlNode> results = new ArrayList<>();
            querySelectorAllHelper(tagName, results);
            return results;
        }
        
        private void querySelectorAllHelper(String tagName, List<HtmlNode> results) {
            if (!isText && this.tagName != null && this.tagName.equals(tagName)) {
                results.add(this);
            }
            
            for (HtmlNode child : children) {
                child.querySelectorAllHelper(tagName, results);
            }
        }
    }
    
    public HtmlParser(String html) {
        this.html = html;
    }
    
    /**
     * Parse the HTML string into a tree structure
     */
    public HtmlNode parse() {
        HtmlNode root = new HtmlNode("root");
        Stack<HtmlNode> stack = new Stack<>();
        stack.push(root);
        
        Token token;
        while ((token = nextToken()).type != TokenType.EOF) {
            switch (token.type) {
                case TEXT:
                    if (!token.content.isEmpty()) {
                        stack.peek().children.add(HtmlNode.createTextNode(token.content));
                    }
                    break;
                    
                case OPEN_TAG:
                    HtmlNode node = new HtmlNode(token.tagName);
                    node.attributes = token.attributes;
                    stack.peek().children.add(node);
                    if (!isSelfClosingTag(token.tagName)) {
                        stack.push(node);
                    }
                    break;
                    
                case CLOSE_TAG:
                    // Find matching open tag
                    while (!stack.isEmpty() && !stack.peek().tagName.equals(token.tagName)) {
                        stack.pop();
                    }
                    if (!stack.isEmpty() && stack.peek().tagName.equals(token.tagName)) {
                        stack.pop();
                    }
                    break;
                    
                case SELF_CLOSING_TAG:
                    HtmlNode selfClosing = new HtmlNode(token.tagName);
                    selfClosing.attributes = token.attributes;
                    stack.peek().children.add(selfClosing);
                    break;
                    
                case COMMENT:
                case DOCTYPE:
                    // Skip comments and doctype
                    break;
            }
        }
        
        return root;
    }
    
    private Token nextToken() {
        if (pos >= html.length()) {
            return new Token(TokenType.EOF, "");
        }
        
        if (html.charAt(pos) == '<') {
            if (pos + 1 < html.length()) {
                if (html.charAt(pos + 1) == '!') {
                    if (pos + 3 < html.length() && html.substring(pos, pos + 4).equals("<!--")) {
                        return parseComment();
                    } else {
                        return parseDoctype();
                    }
                }
            }
            return parseTag();
        } else {
            return parseText();
        }
    }
    
    private Token parseComment() {
        int start = pos;
        pos += 4; // Skip "<!--"
        
        while (pos + 2 < html.length() && !html.substring(pos, pos + 3).equals("-->")) {
            pos++;
        }
        
        if (pos + 2 < html.length()) {
            pos += 3; // Skip "-->"
        }
        
        return new Token(TokenType.COMMENT, html.substring(start, pos));
    }
    
    private Token parseDoctype() {
        int start = pos;
        while (pos < html.length() && html.charAt(pos) != '>') {
            pos++;
        }
        if (pos < html.length()) pos++;
        return new Token(TokenType.DOCTYPE, html.substring(start, pos));
    }
    
    private Token parseTag() {
        int start = pos;
        pos++; // skip '<'
        
        boolean isClosing = false;
        if (pos < html.length() && html.charAt(pos) == '/') {
            isClosing = true;
            pos++;
        }
        
        // Parse tag name
        StringBuilder tagName = new StringBuilder();
        while (pos < html.length() && isValidTagChar(html.charAt(pos))) {
            tagName.append(Character.toLowerCase(html.charAt(pos)));
            pos++;
        }
        
        Token token;
        if (isClosing) {
            // Skip to '>'
            while (pos < html.length() && html.charAt(pos) != '>') {
                pos++;
            }
            if (pos < html.length()) pos++; // skip '>'
            token = new Token(TokenType.CLOSE_TAG, html.substring(start, pos));
            token.tagName = tagName.toString();
            return token;
        }
        
        // Parse attributes
        Map<String, String> attributes = new HashMap<>();
        boolean selfClosing = false;
        
        while (pos < html.length() && html.charAt(pos) != '>') {
            skipWhitespace();
            
            if (pos < html.length() && html.charAt(pos) == '/') {
                selfClosing = true;
                pos++;
                continue;
            }
            
            if (pos < html.length() && html.charAt(pos) == '>') {
                break;
            }
            
            // Parse attribute
            String attrName = parseAttributeName();
            String attrValue = "";
            
            skipWhitespace();
            if (pos < html.length() && html.charAt(pos) == '=') {
                pos++; // skip '='
                skipWhitespace();
                attrValue = parseAttributeValue();
            }
            
            if (!attrName.isEmpty()) {
                attributes.put(attrName.toLowerCase(), attrValue);
            }
        }
        
        if (pos < html.length()) pos++; // skip '>'
        
        token = new Token(selfClosing ? TokenType.SELF_CLOSING_TAG : TokenType.OPEN_TAG, 
                        html.substring(start, pos));
        token.tagName = tagName.toString();
        token.attributes = attributes;
        return token;
    }
    
    private Token parseText() {
        int start = pos;
        while (pos < html.length() && html.charAt(pos) != '<') {
            pos++;
        }
        
        String text = html.substring(start, pos);
        // Decode common HTML entities
        text = text.replace("&lt;", "<")
                   .replace("&gt;", ">")
                   .replace("&amp;", "&")
                   .replace("&quot;", "\"")
                   .replace("&#39;", "'")
                   .replace("&nbsp;", " ");
        
        return new Token(TokenType.TEXT, text);
    }
    
    private boolean isValidTagChar(char c) {
        return Character.isLetterOrDigit(c) || c == '-' || c == '_' || c == ':';
    }
    
    private void skipWhitespace() {
        while (pos < html.length() && Character.isWhitespace(html.charAt(pos))) {
            pos++;
        }
    }
    
    private String parseAttributeName() {
        StringBuilder name = new StringBuilder();
        while (pos < html.length() && (Character.isLetterOrDigit(html.charAt(pos)) || 
               html.charAt(pos) == '-' || html.charAt(pos) == '_' || html.charAt(pos) == ':')) {
            name.append(html.charAt(pos));
            pos++;
        }
        return name.toString();
    }
    
    private String parseAttributeValue() {
        if (pos >= html.length()) return "";
        
        char quote = html.charAt(pos);
        if (quote == '"' || quote == '\'') {
            pos++; // skip opening quote
            StringBuilder value = new StringBuilder();
            while (pos < html.length() && html.charAt(pos) != quote) {
                if (html.charAt(pos) == '\\' && pos + 1 < html.length()) {
                    pos++; // Skip escape character
                }
                value.append(html.charAt(pos));
                pos++;
            }
            if (pos < html.length()) pos++; // skip closing quote
            return value.toString();
        } else {
            // Unquoted attribute value
            StringBuilder value = new StringBuilder();
            while (pos < html.length() && !Character.isWhitespace(html.charAt(pos)) && 
                   html.charAt(pos) != '>' && html.charAt(pos) != '/') {
                value.append(html.charAt(pos));
                pos++;
            }
            return value.toString();
        }
    }
    
    private boolean isSelfClosingTag(String tag) {
        Set<String> selfClosing = new HashSet<>(Arrays.asList(
            "area", "base", "br", "col", "embed", "hr", "img", "input", 
            "link", "meta", "param", "source", "track", "wbr"
        ));
        return selfClosing.contains(tag);
    }
}
