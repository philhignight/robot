### Move and Rename Examples:

````
/chrome> ls
Contents:
  tabs/
  new-tab
  address-bar

# Move a click to a subcontext
/chrome> move new-tab tabs
Moved click 'new-tab' to tabs

# Move a context to root
/chrome> move tabs /
Moved context 'tabs' to /

# Rename a click
/chrome> rename address-bar url-bar
Renamed click 'address-bar' to 'url-bar'

# Move with relative paths
/chrome/devtools> move console-tab ..
Moved click 'console-tab' to /chrome
```### Recording Tips:
- Leave target context blank: Click stays in current context, no navigation
- Use "." for target context: Click will navigate to the current context you're in
- Use absolute path like "/chrome": Click will navigate to that specific context
- Use relative path like "devtools": Click will navigate to devtools within current context# Windows Automation System

Simple automation system for recording and replaying clicks and keyboard actions on Windows.

## Features

- **Visual Recording Overlay**: When recording clicks, a large countdown appears on screen showing remaining seconds, then "RECORDING!" when capturing position, and finally shows the recorded coordinates
- **Filesystem-like Context Organization**: Organize clicks into contexts like folders
- **Flow Automation**: Create JSON flows that execute sequences of clicks and actions
- **Automatic Screenshots**: Every step in a flow is documented with a screenshot
- **Checkpoint System**: Verify automation state with clipboard assertions
- **Git-Friendly**: Clean JSON format for version control

## Setup

1. **Install Dependencies**
   - Node.js 12.18
   - Java 11
   - Download `json-20210307.jar` from Maven repository for JSON parsing in Java

2. **Compile Java**
   ```bash
   javac -cp "json-20210307.jar;." AutomationRobot.java
````

3. **Make Node script executable**
   ```bash
   chmod +x automation-cli.js
   ```

## Usage

1. **Start the CLI**

   ```bash
   node automation-cli.js
   ```

   You'll see:

   ```
   Starting automation system...
   Initializing Java Robot controller...
   Automation Robot started. Watching for commands...
   Looking for input file: C:\Users\...\input.txt
   System ready!

   === Windows Automation CLI ===

   Quick Start:
     1. Create a context:     mkcontext chrome
     2. Record a click:       record
     3. Navigate context:     cd chrome
     4. Run automation:       run my-flow

   Commands:
     record         - Record click with 5 second countdown
     recordfast/rf  - Record click with 2 second countdown
     ls            - List contexts and clicks in current context
     cd <path>     - Change context (cd .., cd /, cd chrome)
     mkcontext <n> - Create new context
     run <flow>    - Execute flow from flows/ directory
     clear/cls     - Clear screen and show help
     help / ?      - Show this help
     exit          - Quit

   Current context: />
   ```

2. **Basic Commands**
   - `mkcontext chrome` - Create a new context called "chrome"
   - `record` - Record a new click (5 second countdown, type "cancel" to abort)
   - `recordfast` or `rf` - Record a new click (2 second countdown, type "cancel" to abort)
   - `ls` - List all contexts and clicks in current context
   - `cd chrome` - Navigate into the chrome context
   - `cd ..` - Go back to parent context
   - `cd /` - Go to root context
   - `move item target` - Move a click or context to another parent
   - `rename old new` - Rename a click or context
   - `run my-flow` - Execute flow from flows/my-flow.json
   - `clear` or `cls` - Clear screen and show help
   - `help` or `?` - Show usage instructions
   - `exit` - Quit

## Recording Workflow Example

```
/> mkcontext chrome
Context 'chrome' created
Tip: Use 'cd chrome' to enter this context, then 'record' to add clicks
/> record
Click name: open-chrome
Target context (Enter="/", "*"=any, or path): /chrome
You have 5 seconds to position your mouse...
(Large red countdown appears on screen: 5... 4... 3... 2... 1...)
(Screen shows "RECORDING!" overlay)
(Screen shows "Recorded! (745, 1060)" for 2 seconds)
Click recorded at (745, 1060)

Click 'open-chrome' saved at (745, 1060)
Target context: /chrome
Location: />open-chrome
/> ls
Contents:
  chrome/
  open-chrome
/> cd chrome
/chrome> recordfast
Click name: new-tab
Target context (Enter="/chrome", "*"=any, or path):
Using default context: /chrome
You have 2 seconds to position your mouse...
(Large red countdown appears on screen: 2... 1...)
(Screen shows "RECORDING!" overlay)
(Screen shows "Recorded! (240, 15)" for 2 seconds)
Click recorded at (240, 15)

Click 'new-tab' saved at (240, 15)
Target context: /chrome
Location: /chrome>new-tab
/chrome> record
Click name: search-box
Target context (Enter="/chrome", "*"=any, or path): *
Click will not change context
You have 5 seconds to position your mouse...
```

## Flow File Structure

Flows are JSON files in the `flows/` directory. See `example-flow.json` for reference.

### Available Step Types:

- `click` - Click a recorded position
- `type` - Type text
- `key` - Press key combination (e.g., "ctrl+v")
- `copy` - Copy to clipboard
- `paste` - Paste from clipboard
- `pause` - Wait for milliseconds or user input
- `navigate` - Change context (cd command)
- `checkpoint` - Verify state with assertions
- `flow` - Call another flow
- `scroll` - Mouse wheel scroll

## Directory Structure

```
project/
├── automation-cli.js      # Node.js CLI
├── AutomationRobot.java   # Java robot controller
├── clicks.json           # Recorded clicks database (hierarchical under _root)
├── flows/               # Flow definitions
│   └── example-flow.json
├── logs/                # Execution logs and screenshots
│   └── flowname_timestamp/
│       ├── 00001-click.json
│       ├── 00001-screenshot.png
│       └── ...
```

## Notes

- Screenshots are taken after each step during flow execution
- Each flow execution creates a new timestamped log directory
- Clicks can have target contexts to automatically navigate after clicking
- Checkpoints can verify clipboard content to ensure correct state
- The system uses file-based communication between Node.js and Java
- All contexts are subcontexts of the root (\_root) - the app will automatically migrate old formats
- Click scope follows a closure-like pattern - you can access clicks from parent contexts and their siblings
