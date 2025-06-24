# Windows Automation System - Flow Building Specification

## Overview

This system allows recording mouse clicks and keyboard actions, then combining them into automated workflows (flows). Flows are JSON files that execute sequences of actions.

**IMPORTANT RULES FOR AI ASSISTANTS:**

1. **NEVER use a "type" action** - Text input must ALWAYS use setClipboard + paste
2. **Always add pauses after UI changes** - Usually 500-2000ms
3. **Always select all before pasting** - Use ctrl+a to clear fields first
4. **Use forward slashes in paths** - Even on Windows: `C:/Users/...` not `C:\Users\...`

## System Architecture

### 1. Clicks Database (clicks.json)

Stores recorded click positions organized in a hierarchical context structure:

```json
{
  "contexts": {
    "_root": {
      "clicks": {
        "click-name": {
          "x": 100,
          "y": 200,
          "targetContext": "/some/context"  // Optional - where to navigate after click
        }
      },
      "subcontexts": {
        "chrome": {
          "clicks": { ... },
          "subcontexts": {
            "tabs": { ... }
          }
        }
      }
    }
  }
}
```

### 2. Context System

- Contexts are like directories in a filesystem
- Path notation: `/` is root, `/chrome` is chrome context, `/chrome/tabs` is tabs subcontext
- Each click lives in exactly one context
- Clicks can optionally navigate to a different context when executed

### 3. Click Visibility (Scope Chain)

When a flow executes a click, it searches for the click name in this order:

1. Current context
2. Parent context and its siblings
3. Grandparent context and its siblings
4. Continue up to root

## Flow File Format

### Basic Structure

```json
{
  "name": "flow-name",
  "description": "What this flow does",
  "allowedContext": "/", // Where flow can be started (usually "/")
  "steps": [
    // Array of step objects
  ]
}
```

## Available Step Types

### 1. click

Executes a recorded mouse click.

```json
{
  "type": "click",
  "name": "click-name", // Must exist in clicks.json
  "doubleClick": false, // Optional, default false
  "comment": "Optional comment"
}
```

### 2. setClipboard

Sets the system clipboard content (Windows only, uses clip.exe).

```json
{
  "type": "setClipboard",
  "text": "Text to put in clipboard",
  "comment": "Optional comment"
}
```

### 3. paste

Pastes from clipboard (Ctrl+V).

```json
{
  "type": "paste",
  "comment": "Optional comment"
}
```

### 4. copy

Copies to clipboard (Ctrl+C).

```json
{
  "type": "copy",
  "comment": "Optional comment"
}
```

### 5. key

Presses keyboard shortcuts or single keys.

```json
{
  "type": "key",
  "keys": "ctrl+a", // Examples: "enter", "tab", "ctrl+s", "alt+f4"
  "comment": "Optional comment"
}
```

**Common Key Combinations:**

- Select all: `ctrl+a`
- Copy/Cut/Paste: `ctrl+c`, `ctrl+x`, `ctrl+v`
- Save: `ctrl+s`
- Undo/Redo: `ctrl+z`, `ctrl+y`
- Find: `ctrl+f`
- New tab: `ctrl+t`
- Close: `ctrl+w`, `alt+f4`
- Switch apps: `alt+tab`
- Run dialog: `windows+r`
- Navigate: `tab`, `shift+tab`, arrow keys
- Delete: `delete`, `backspace`

### 6. pause

Waits for a specified time or user input.

```json
{
  "type": "pause",
  "ms": 2000,  // Milliseconds to wait
  "comment": "Optional comment"
}
// OR
{
  "type": "pause",
  "message": "Click OK to continue",  // Shows message and waits for Enter
  "comment": "Optional comment"
}
```

### 7. navigate

Changes the current context (like `cd` command).

```json
{
  "type": "navigate",
  "path": "/chrome/tabs", // Absolute or relative path
  "comment": "Optional comment"
}
```

### 8. scroll

Scrolls the mouse wheel.

```json
{
  "type": "scroll",
  "amount": 5, // Positive = down, negative = up
  "comment": "Optional comment"
}
```

### 9. checkpoint

Executes actions and verifies results (usually clipboard content).

```json
{
  "type": "checkpoint",
  "checkpoint": {
    "name": "verify-something",
    "actions": [
      {
        "type": "click",
        "name": "some-text"
      },
      {
        "type": "copy"
      },
      {
        "type": "copy",
        "expect": "Expected text" // Fails if clipboard doesn't match
      }
    ]
  },
  "comment": "Optional comment"
}
```

### 10. flow

Executes another flow file.

```json
{
  "type": "flow",
  "flowName": "other-flow-name", // Without .json extension
  "comment": "Optional comment"
}
```

## Critical Patterns - ALWAYS USE THESE

### Text Input Pattern (NEVER use "type")

```json
[
  { "type": "click", "name": "input-field" },
  { "type": "key", "keys": "ctrl+a" },
  { "type": "setClipboard", "text": "your text here" },
  { "type": "paste" }
]
```

### Open Application

```json
[
  { "type": "key", "keys": "windows+r" },
  { "type": "pause", "ms": 500 },
  { "type": "setClipboard", "text": "notepad" },
  { "type": "paste" },
  { "type": "key", "keys": "enter" }
]
```

### Navigate to URL

```json
[
  { "type": "click", "name": "address-bar" },
  { "type": "key", "keys": "ctrl+a" },
  { "type": "setClipboard", "text": "https://example.com" },
  { "type": "paste" },
  { "type": "key", "keys": "enter" },
  { "type": "pause", "ms": 3000, "comment": "Wait for page load" }
]
```

### Save File with Specific Name

```json
[
  { "type": "key", "keys": "ctrl+s" },
  { "type": "pause", "ms": 1000 },
  { "type": "click", "name": "filename-input" },
  { "type": "key", "keys": "ctrl+a" },
  { "type": "setClipboard", "text": "C:/path/to/file.txt" },
  { "type": "paste" },
  { "type": "click", "name": "save-button" }
]
```

### Fill Form Field

```json
[
  { "type": "click", "name": "form-field" },
  { "type": "key", "keys": "ctrl+a" },
  { "type": "key", "keys": "delete" },
  { "type": "setClipboard", "text": "field value" },
  { "type": "paste" }
]
```

## Example AI Request/Response

**User:** "I have recorded clicks for opening Chrome, clicking the address bar, and clicking search. Create a flow that searches for 'weather forecast'."

**Assistant Response:**

```json
{
  "name": "search-weather",
  "description": "Opens Chrome and searches for weather forecast",
  "allowedContext": "/",
  "steps": [
    {
      "type": "click",
      "name": "open-chrome",
      "comment": "Click Chrome icon - may navigate to /chrome"
    },
    {
      "type": "pause",
      "ms": 2000,
      "comment": "Wait for Chrome to fully load"
    },
    {
      "type": "click",
      "name": "address-bar",
      "comment": "Click address bar to focus"
    },
    {
      "type": "key",
      "keys": "ctrl+a",
      "comment": "Select all existing text"
    },
    {
      "type": "setClipboard",
      "text": "weather forecast"
    },
    {
      "type": "paste",
      "comment": "Paste search term"
    },
    {
      "type": "key",
      "keys": "enter",
      "comment": "Submit search"
    }
  ]
}
```

## Best Practices

1. **ALWAYS use clipboard for text input** - The "type" action does not exist in this system
2. **Add pauses after actions that change UI** - Clicks that open menus, navigate pages, etc.
3. **Use comments liberally** - Explain what each step does
4. **Test with checkpoints** - Verify you're in the expected state
5. **Handle popups/dialogs** - They often change context, use navigate if needed
6. **Clear fields before input** - Always use ctrl+a before pasting

## Limitations & Notes

1. **Windows Only** - Clipboard operations use Windows clip.exe
2. **No Variables** - Flows cannot store or reuse values dynamically
3. **No Conditionals** - Flows execute linearly, use checkpoints to fail fast
4. **Screen Resolution** - Clicks are absolute coordinates, must match recording resolution
5. **Timing Sensitive** - May need to adjust pause durations for different systems
6. **No "type" action** - Text MUST be entered via clipboard

## Debugging Tips

1. Add `pause` steps with messages to check state during development
2. Check logs directory - each execution creates timestamped logs with screenshots
3. Verify context navigation - some clicks change context automatically
4. Start with simple flows before building complex ones
5. If text isn't appearing, ensure you're using setClipboard + paste, not "type"
