const { JSDOM } = require('jsdom');

class HtmlToMarkdownConverter {
    constructor() {
        this.listCounters = [];
        this.inPre = false;
        this.indentLevel = 0;
    }

    convert(html) {
        // Parse HTML using jsdom
        const dom = new JSDOM(html);
        const doc = dom.window.document;
        
        // Process body content (or document if no body)
        const rootElement = doc.body || doc.documentElement;
        const markdown = this.processNode(rootElement).trim();
        
        // Clean up excessive newlines
        return markdown.replace(/\n{3,}/g, '\n\n');
    }

    isHidden(element) {
        if (element.nodeType !== 1) return false; // Only check elements
        
        // Check for hidden attribute
        if (element.hasAttribute('hidden')) return true;
        
        // Check for display:none or visibility:hidden in style attribute
        const style = element.getAttribute('style');
        if (style) {
            if (style.includes('display:none') || style.includes('display: none')) return true;
            if (style.includes('visibility:hidden') || style.includes('visibility: hidden')) return true;
        }
        
        return false;
    }

    isInteractiveElement(element) {
        const interactive = ['button', 'input', 'textarea', 'select', 'a'];
        return interactive.includes(element.tagName.toLowerCase());
    }

    isTextElement(element) {
        const textElements = ['p', 'span', 'div', 'em', 'strong', 'b', 'i', 'code'];
        return textElements.includes(element.tagName.toLowerCase());
    }

    shouldPreserveHierarchy(element) {
        const tagName = element.tagName.toLowerCase();
        
        // Always preserve these semantic elements
        const semanticElements = ['nav', 'header', 'footer', 'main', 'aside', 'article', 'section', 'form', 'ul', 'ol'];
        if (semanticElements.includes(tagName)) return true;
        
        // Get meaningful children (non-empty, non-hidden)
        const meaningfulChildren = Array.from(element.children).filter(child => 
            child.textContent.trim().length > 0 && !this.isHidden(child)
        );
        
        // Collapse single-child wrappers (unless semantic)
        if (meaningfulChildren.length <= 1) return false;
        
        // Preserve if it has mixed content types
        const childTypes = new Set();
        for (const child of meaningfulChildren) {
            if (this.isInteractiveElement(child)) childTypes.add('interactive');
            else if (child.tagName.match(/^H[1-6]$/)) childTypes.add('heading');
            else childTypes.add('text');
        }
        if (childTypes.size > 1) return true;
        
        // Preserve if it has attributes that suggest grouping
        const className = element.className.toLowerCase();
        const groupingClasses = ['message', 'comment', 'post', 'item', 'entry', 'record', 'card', 'user', 'author'];
        if (groupingClasses.some(cls => className.includes(cls))) return true;
        
        // Preserve if children are substantial blocks
        if (meaningfulChildren.length > 1) return true;
        
        return false;
    }

    getIndent() {
        return '  '.repeat(this.indentLevel);
    }

    processNode(node, skipIndent = false) {
        // Skip hidden elements
        if (this.isHidden(node)) {
            return '';
        }

        // Handle text nodes
        if (node.nodeType === 3) { // TEXT_NODE
            const text = this.inPre ? node.textContent : node.textContent.replace(/\s+/g, ' ').trim();
            if (!text) return '';
            return skipIndent ? text : this.getIndent() + text;
        }

        // Handle element nodes
        if (node.nodeType === 1) { // ELEMENT_NODE
            return this.processElement(node, skipIndent);
        }

        return '';
    }

    processElement(element, skipIndent = false) {
        const tagName = element.tagName.toLowerCase();
        const indent = skipIndent ? '' : this.getIndent();

        // Handle different element types
        switch (tagName) {
            // Headings - preserve as markdown but respect indentation
            case 'h1': return `${indent}# ${this.getTextContent(element)}\n`;
            case 'h2': return `${indent}## ${this.getTextContent(element)}\n`;
            case 'h3': return `${indent}### ${this.getTextContent(element)}\n`;
            case 'h4': return `${indent}#### ${this.getTextContent(element)}\n`;
            case 'h5': return `${indent}##### ${this.getTextContent(element)}\n`;
            case 'h6': return `${indent}###### ${this.getTextContent(element)}\n`;

            // Text formatting - inline, no extra indentation
            case 'strong':
            case 'b': return `**${this.processChildrenInline(element)}**`;
            case 'em':
            case 'i': return `*${this.processChildrenInline(element)}*`;
            case 'code': 
                if (element.parentElement?.tagName.toLowerCase() === 'pre') {
                    return element.textContent;
                }
                return `\`${element.textContent}\``;
            
            // Block elements
            case 'p': 
                const pContent = this.processChildrenInline(element);
                return pContent ? `${indent}${pContent}\n` : '';
            
            case 'pre':
                this.inPre = true;
                const content = this.processChildrenInline(element);
                this.inPre = false;
                return `${indent}\`\`\`\n${content}\n${indent}\`\`\`\n`;
            
            case 'blockquote': 
                return `${indent}> ${this.processChildrenInline(element)}\n`;
            
            case 'hr': return `${indent}---\n`;
            case 'br': return '\n';

            // Links and images
            case 'a':
                const href = element.getAttribute('href');
                const text = this.getTextContent(element);
                return href ? `[${text}](${href})` : text;
            case 'img':
                const alt = element.getAttribute('alt') || 'image';
                return `![${alt}]`;

            // Lists
            case 'ul':
            case 'ol':
                this.listCounters.push(0);
                const listResult = this.processListItems(element);
                this.listCounters.pop();
                return listResult;
            
            case 'li':
                // Handled by processListItems
                return '';

            // Forms
            case 'button':
                return `${indent}[Button: ${this.getTextContent(element)}]\n`;
            case 'input':
                return this.processInput(element, indent);
            case 'textarea':
                const placeholder = element.getAttribute('placeholder') || 
                                 element.getAttribute('name') || 
                                 'text';
                return `${indent}[Textarea: ${placeholder}]\n`;
            case 'select':
                const selected = element.querySelector('option[selected]') || 
                               element.querySelector('option:checked') ||
                               element.querySelector('option');
                return `${indent}[Select: ${selected ? selected.textContent.trim() : 'options'}]\n`;

            // Tables
            case 'table':
                return this.processTable(element, indent);

            // Semantic sections
            case 'header':
                return `${indent}[Header]\n${this.processChildrenBlock(element, true)}`;
            case 'nav':
                return `${indent}[Navigation]\n${this.processChildrenBlock(element, true)}`;
            case 'main':
                return `${indent}[Main Content]\n${this.processChildrenBlock(element, true)}`;
            case 'aside':
                return `${indent}[Sidebar]\n${this.processChildrenBlock(element, true)}`;
            case 'footer':
                return `${indent}[Footer]\n${this.processChildrenBlock(element, true)}`;
            case 'form':
                return this.processChildrenBlock(element, this.shouldPreserveHierarchy(element));

            // Skip these entirely
            case 'script':
            case 'style':
            case 'noscript':
                return '';

            // For containers, decide whether to preserve hierarchy
            default:
                if (this.shouldPreserveHierarchy(element)) {
                    return this.processChildrenBlock(element, true);
                } else {
                    // Collapse - process children without extra indentation
                    return this.processChildrenBlock(element, false);
                }
        }
    }

    processListItems(listElement) {
        let result = '';
        const items = listElement.querySelectorAll(':scope > li');
        const isOrdered = listElement.tagName.toLowerCase() === 'ol';
        
        items.forEach((item, index) => {
            const depth = this.listCounters.length - 1;
            const indent = this.getIndent();
            
            if (isOrdered) {
                this.listCounters[depth]++;
                result += `${indent}${this.listCounters[depth]}. ${this.processChildrenInline(item)}\n`;
            } else {
                result += `${indent}- ${this.processChildrenInline(item)}\n`;
            }
        });
        
        return result;
    }

    processChildrenInline(element) {
        let result = '';
        for (const child of element.childNodes) {
            if (child.nodeType === 3) { // TEXT_NODE
                const text = this.inPre ? child.textContent : child.textContent.replace(/\s+/g, ' ');
                result += text;
            } else if (child.nodeType === 1 && !this.isHidden(child)) {
                result += this.processNode(child, true);
            }
        }
        return result.trim();
    }

    processChildrenBlock(element, preserveHierarchy) {
        let result = '';
        const children = Array.from(element.childNodes).filter(child => {
            if (child.nodeType === 3) return child.textContent.trim().length > 0;
            if (child.nodeType === 1) return !this.isHidden(child);
            return false;
        });

        if (preserveHierarchy) {
            this.indentLevel++;
        }

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const processed = this.processNode(child, false);
            if (processed) {
                result += processed;
                // Add newline if not already present and not last child
                if (!processed.endsWith('\n') && i < children.length - 1) {
                    result += '\n';
                }
            }
        }

        if (preserveHierarchy) {
            this.indentLevel--;
        }

        return result;
    }

    processInput(element, indent) {
        const type = element.getAttribute('type') || 'text';
        const name = element.getAttribute('name');
        const placeholder = element.getAttribute('placeholder');
        const value = element.getAttribute('value');
        const checked = element.hasAttribute('checked');
        const label = placeholder || name || value || type;

        switch (type) {
            case 'button':
            case 'submit':
                return `${indent}[${type === 'submit' ? 'Submit' : 'Button'}: ${value || 'Submit'}]\n`;
            case 'checkbox':
                return `${indent}${checked ? '[x]' : '[ ]'}`;
            case 'radio':
                return `${indent}${checked ? '(•)' : '( )'}`;
            case 'hidden':
                return ''; // Skip hidden inputs
            case 'text':
            case 'email':
            case 'password':
            case 'search':
            case 'tel':
            case 'url':
                return `${indent}[Input: ${label}]\n`;
            default:
                return `${indent}[Input: ${label}]\n`;
        }
    }

    processTable(table, indent) {
        const rows = [];
        const allRows = table.querySelectorAll('tr');
        
        if (allRows.length === 0) return '';

        allRows.forEach((row) => {
            const cells = row.querySelectorAll('th, td');
            if (cells.length === 0) return;
            
            const rowContent = Array.from(cells)
                .map(cell => this.getTextContent(cell).trim())
                .join(' | ');
            
            rows.push(`${indent}| ${rowContent} |`);
        });

        return rows.join('\n') + '\n';
    }

    getTextContent(element) {
        let text = '';
        for (const child of element.childNodes) {
            if (child.nodeType === 3) { // TEXT_NODE
                text += child.textContent;
            } else if (child.nodeType === 1 && !this.isHidden(child)) { // ELEMENT_NODE
                const tagName = child.tagName.toLowerCase();
                // For certain inline elements, we want to preserve their formatting
                if (['strong', 'b', 'em', 'i', 'code'].includes(tagName)) {
                    text += this.processElement(child, true);
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
    const fs = require('fs');
    const path = require('path');

    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node html-to-markdown.js <input.html> [output.md]');
        console.log('Or pipe HTML: echo "<h1>Test</h1>" | node html-to-markdown.js');
        process.exit(1);
    }

    const converter = new HtmlToMarkdownConverter();

    if (args[0]) {
        // File input
        const inputFile = args[0];
        const outputFile = args[1] || inputFile.replace(/\.html?$/i, '') + '.md';

        try {
            const html = fs.readFileSync(inputFile, 'utf8');
            const markdown = converter.convert(html);
            
            if (args[1]) {
                fs.writeFileSync(outputFile, markdown);
                console.log(`Converted ${inputFile} to ${outputFile}`);
            } else {
                console.log(markdown);
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    } else {
        // Stdin input
        let html = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => html += chunk);
        process.stdin.on('end', () => {
            const markdown = converter.convert(html);
            console.log(markdown);
        });
    }
}
