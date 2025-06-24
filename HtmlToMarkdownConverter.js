const { JSDOM } = require("jsdom");

class HtmlToMarkdownConverter {
  constructor() {
    this.listCounters = [];
    this.inPre = false;
  }

  convert(html) {
    // Parse HTML using jsdom
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Process body content (or document if no body)
    const rootElement = doc.body || doc.documentElement;
    const markdown = this.processNode(rootElement).trim();

    // Clean up excessive newlines
    return markdown.replace(/\n{3,}/g, "\n\n");
  }

  isHidden(element) {
    if (element.nodeType !== 1) return false; // Only check elements

    // Check for hidden attribute
    if (element.hasAttribute("hidden")) return true;

    // Check for display:none or visibility:hidden in style attribute
    const style = element.getAttribute("style");
    if (style) {
      if (style.includes("display:none") || style.includes("display: none"))
        return true;
      if (
        style.includes("visibility:hidden") ||
        style.includes("visibility: hidden")
      )
        return true;
    }

    return false;
  }

  processNode(node) {
    // Skip hidden elements
    if (this.isHidden(node)) {
      return "";
    }

    // Handle text nodes
    if (node.nodeType === 3) {
      // TEXT_NODE
      if (this.inPre) {
        return node.textContent;
      }
      // Normalize whitespace for non-pre text
      return node.textContent.replace(/\s+/g, " ");
    }

    // Handle element nodes
    if (node.nodeType === 1) {
      // ELEMENT_NODE
      return this.processElement(node);
    }

    return "";
  }

  processElement(element) {
    const tagName = element.tagName.toLowerCase();

    // Handle different element types
    switch (tagName) {
      // Headings
      case "h1":
        return `# ${this.getTextContent(element)}\n\n`;
      case "h2":
        return `## ${this.getTextContent(element)}\n\n`;
      case "h3":
        return `### ${this.getTextContent(element)}\n\n`;
      case "h4":
        return `#### ${this.getTextContent(element)}\n\n`;
      case "h5":
        return `##### ${this.getTextContent(element)}\n\n`;
      case "h6":
        return `###### ${this.getTextContent(element)}\n\n`;

      // Text formatting
      case "p":
        return `${this.processChildren(element)}\n\n`;
      case "strong":
      case "b":
        return `**${this.processChildren(element)}**`;
      case "em":
      case "i":
        return `*${this.processChildren(element)}*`;
      case "code":
        if (element.parentElement?.tagName.toLowerCase() === "pre") {
          return element.textContent;
        }
        return `\`${element.textContent}\``;
      case "pre":
        this.inPre = true;
        const content = this.processChildren(element);
        this.inPre = false;
        return `\`\`\`\n${content}\n\`\`\`\n\n`;
      case "blockquote":
        return `> ${this.processChildren(element)}\n\n`;
      case "hr":
        return `---\n\n`;
      case "br":
        return `\n`;

      // Links and images
      case "a":
        const href = element.getAttribute("href");
        const text = this.getTextContent(element);
        return href ? `[${text}](${href})` : text;
      case "img":
        const alt = element.getAttribute("alt") || "image";
        return `![${alt}]`;

      // Lists
      case "ul":
      case "ol":
        this.listCounters.push(0);
        const listContent = this.processChildren(element);
        this.listCounters.pop();
        return `${listContent}\n`;
      case "li":
        const depth = this.listCounters.length - 1;
        const indent = "  ".repeat(depth);
        const parentList = element.parentElement.tagName.toLowerCase();
        if (parentList === "ol") {
          this.listCounters[depth]++;
          return `${indent}${this.listCounters[depth]}. ${this.processChildren(
            element
          )}\n`;
        } else {
          return `${indent}- ${this.processChildren(element)}\n`;
        }

      // Forms
      case "button":
        return `[Button: ${this.getTextContent(element)}]`;
      case "input":
        return this.processInput(element);
      case "textarea":
        const placeholder =
          element.getAttribute("placeholder") ||
          element.getAttribute("name") ||
          "text";
        return `[Textarea: ${placeholder}]`;
      case "select":
        const selected =
          element.querySelector("option[selected]") ||
          element.querySelector("option:checked") ||
          element.querySelector("option");
        return `[Select: ${
          selected ? selected.textContent.trim() : "options"
        }]`;
      case "label":
        // Process label but don't add extra formatting
        return this.processChildren(element);

      // Tables
      case "table":
        return this.processTable(element) + "\n";

      // Semantic sections
      case "header":
        return `[Header]\n${this.processChildren(element)}\n`;
      case "nav":
        return `[Navigation]\n${this.processChildren(element)}\n`;
      case "main":
        return `[Main Content]\n${this.processChildren(element)}\n`;
      case "aside":
        return `[Sidebar]\n${this.processChildren(element)}\n`;
      case "footer":
        return `[Footer]\n${this.processChildren(element)}\n`;

      // Skip these entirely
      case "script":
      case "style":
      case "noscript":
        return "";

      // For all other elements, just process children
      default:
        return this.processChildren(element);
    }
  }

  processInput(element) {
    const type = element.getAttribute("type") || "text";
    const name = element.getAttribute("name");
    const placeholder = element.getAttribute("placeholder");
    const value = element.getAttribute("value");
    const checked = element.hasAttribute("checked");
    const label = placeholder || name || value || type;

    switch (type) {
      case "button":
      case "submit":
        return `[${type === "submit" ? "Submit" : "Button"}: ${
          value || "Submit"
        }]`;
      case "checkbox":
        return checked ? "[x]" : "[ ]";
      case "radio":
        return checked ? "(•)" : "( )";
      case "hidden":
        return ""; // Skip hidden inputs
      case "text":
      case "email":
      case "password":
      case "search":
      case "tel":
      case "url":
        return `[Input: ${label}]`;
      default:
        return `[Input: ${label}]`;
    }
  }

  processTable(table) {
    const rows = [];
    const allRows = table.querySelectorAll("tr");

    if (allRows.length === 0) return "";

    allRows.forEach((row, index) => {
      const cells = row.querySelectorAll("th, td");
      if (cells.length === 0) return;

      const rowContent = Array.from(cells)
        .map((cell) => this.getTextContent(cell).trim())
        .join(" | ");

      rows.push(`| ${rowContent} |`);
    });

    return rows.join("\n");
  }

  processChildren(element) {
    let result = "";
    for (const child of element.childNodes) {
      result += this.processNode(child);
    }
    return result;
  }

  getTextContent(element) {
    let text = "";
    for (const child of element.childNodes) {
      if (child.nodeType === 3) {
        // TEXT_NODE
        text += child.textContent;
      } else if (child.nodeType === 1 && !this.isHidden(child)) {
        // ELEMENT_NODE
        const tagName = child.tagName.toLowerCase();
        // For certain inline elements, we want to preserve their formatting
        if (["strong", "b", "em", "i", "code"].includes(tagName)) {
          text += this.processElement(child);
        } else {
          text += this.getTextContent(child);
        }
      }
    }
    return text.trim();
  }
}

// Export for use as a module
module.exports = HtmlToMarkdownConverter;

// Command line interface
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");

  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node html-to-markdown.js <input.html> [output.md]");
    console.log(
      'Or pipe HTML: echo "<h1>Test</h1>" | node html-to-markdown.js'
    );
    process.exit(1);
  }

  const converter = new HtmlToMarkdownConverter();

  if (args[0]) {
    // File input
    const inputFile = args[0];
    const outputFile = args[1] || inputFile.replace(/\.html?$/i, "") + ".md";

    try {
      const html = fs.readFileSync(inputFile, "utf8");
      const markdown = converter.convert(html);

      if (args[1]) {
        fs.writeFileSync(outputFile, markdown);
        console.log(`Converted ${inputFile} to ${outputFile}`);
      } else {
        console.log(markdown);
      }
    } catch (error) {
      console.error("Error:", error.message);
      process.exit(1);
    }
  } else {
    // Stdin input
    let html = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (html += chunk));
    process.stdin.on("end", () => {
      const markdown = converter.convert(html);
      console.log(markdown);
    });
  }
}
