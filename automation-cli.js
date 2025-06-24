#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

// File paths
const CLICKS_FILE = "clicks.json";
const INPUT_FILE = "input.txt";
const OUTPUT_FILE = "output.txt";
const FLOWS_DIR = "flows";
const LOGS_DIR = "logs";

class AutomationCLI {
  constructor() {
    this.currentContext = [];
    this.clicks = this.loadClicks();
    this.javaProcess = null;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
    });

    this.initDirs();
    this.startJavaRobot();
  }

  initDirs() {
    if (!fs.existsSync(FLOWS_DIR)) fs.mkdirSync(FLOWS_DIR);
    if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR);
  }

  startJavaRobot() {
    console.log("Starting automation system...");
    console.log("Initializing Java Robot controller...");

    // Clean up any existing files
    if (fs.existsSync(INPUT_FILE)) fs.unlinkSync(INPUT_FILE);
    if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);

    // Check if running from distribution (JAR exists)
    let javaArgs;
    if (fs.existsSync("AutomationRobot.jar")) {
      console.log("Running from distribution JAR...");
      javaArgs = ["-jar", "AutomationRobot.jar"];
    } else if (
      fs.existsSync("json-20210307.jar") &&
      fs.existsSync("AutomationRobot.class")
    ) {
      console.log("Running from development environment...");
      javaArgs = ["-cp", "json-20210307.jar;.", "AutomationRobot"];
    } else {
      console.error(
        "ERROR: AutomationRobot.jar or compiled classes not found!"
      );
      console.error("Please run build-dist.bat or compile-and-run.bat first.");
      process.exit(1);
    }

    this.javaProcess = spawn("java", javaArgs, {
      stdio: "inherit",
    });

    this.javaProcess.on("error", (err) => {
      console.error("Failed to start Java Robot:", err);
      process.exit(1);
    });

    // Give Java time to start
    setTimeout(() => {
      console.log("System ready!\n");
      this.start();
    }, 2000);
  }

  loadClicks() {
    if (fs.existsSync(CLICKS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CLICKS_FILE, "utf8"));
      // Migrate old format if needed
      if (data.contexts && !data.contexts._root) {
        const oldContexts = { ...data.contexts };
        data.contexts = {
          _root: {
            clicks: {},
            subcontexts: oldContexts,
          },
        };
        this.saveClicksData(data);
      }
      return data;
    }
    return {
      contexts: {
        _root: {
          clicks: {},
          subcontexts: {},
        },
      },
    };
  }

  saveClicksData(data) {
    fs.writeFileSync(CLICKS_FILE, JSON.stringify(data, null, 2));
  }

  saveClicks() {
    this.saveClicksData(this.clicks);
  }

  getPrompt() {
    return `/${this.currentContext.join("/")}>`;
  }

  getCurrentContextObj() {
    let obj = this.clicks.contexts._root;
    for (const ctx of this.currentContext) {
      if (!obj.subcontexts[ctx]) {
        obj.subcontexts[ctx] = { clicks: {}, subcontexts: {} };
      }
      obj = obj.subcontexts[ctx];
    }
    return obj;
  }

  async sendToRobot(command) {
    fs.writeFileSync(INPUT_FILE, JSON.stringify(command));

    // Wait for response
    let attempts = 0;
    while (attempts < 100) {
      // 10 seconds timeout
      if (fs.existsSync(OUTPUT_FILE)) {
        try {
          const content = fs.readFileSync(OUTPUT_FILE, "utf8");
          if (content && content.trim()) {
            fs.unlinkSync(OUTPUT_FILE);
            return JSON.parse(content);
          }
        } catch (e) {
          console.error("Error reading robot response:", e);
        }
      }
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }
    console.error("Robot timeout - no response received");
    throw new Error("Robot timeout");
  }

  async ask(question) {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  getAllContextPaths(
    obj = this.clicks.contexts._root,
    currentPath = "",
    paths = []
  ) {
    // Add current path if it's not root
    if (currentPath !== "") {
      paths.push(currentPath);
    }

    // Recursively add all subcontexts
    if (obj.subcontexts) {
      for (const name in obj.subcontexts) {
        const newPath =
          currentPath === "" ? `/${name}` : `${currentPath}/${name}`;
        this.getAllContextPaths(obj.subcontexts[name], newPath, paths);
      }
    }

    return paths;
  }

  async recordClick(delay = 5) {
    const name = await this.ask('Click name (or "cancel"): ');
    if (!name || name.toLowerCase() === "cancel") {
      console.log("Recording cancelled");
      return;
    }

    // Build menu of available contexts
    const allContexts = this.getAllContextPaths();
    allContexts.unshift("/"); // Add root at the beginning

    console.log("\nWhere should this click navigate to?");
    console.log("  0) Stay in current context (no navigation)");
    allContexts.forEach((ctx, i) => {
      const currentMarker =
        ctx === "/" + this.currentContext.join("/") ||
        (ctx === "/" && this.currentContext.length === 0)
          ? " [current]"
          : "";
      console.log(`  ${i + 1}) ${ctx}${currentMarker}`);
    });
    console.log(`  ${allContexts.length + 1}) Create new context...`);

    const choice = await this.ask(
      "\nEnter your choice (0-" + (allContexts.length + 1) + ', or "cancel"): '
    );
    if (!choice || choice.toLowerCase() === "cancel") {
      console.log("Recording cancelled");
      return;
    }

    const choiceNum = parseInt(choice);
    let targetContext = "";

    if (choiceNum === 0) {
      console.log("Click will not change context");
    } else if (choiceNum > 0 && choiceNum <= allContexts.length) {
      targetContext = allContexts[choiceNum - 1];
      console.log(`Click will navigate to: ${targetContext}`);
    } else if (choiceNum === allContexts.length + 1) {
      // Create new context
      const newContextName = await this.ask(
        'Name for new context (or "cancel"): '
      );
      if (!newContextName || newContextName.toLowerCase() === "cancel") {
        console.log("Recording cancelled");
        return;
      }

      // Create the context in current location
      const created = this.makeContext(newContextName);
      if (!created) {
        console.log("Recording cancelled");
        return;
      }
      targetContext =
        this.currentContext.length === 0
          ? `/${newContextName}`
          : `/${this.currentContext.join("/")}/${newContextName}`;
      console.log(`Click will navigate to new context: ${targetContext}`);
    } else {
      console.log("Invalid choice, recording cancelled");
      return;
    }

    console.log(`\nYou have ${delay} seconds to position your mouse...`);

    // Show countdown overlay
    for (let i = delay; i > 0; i--) {
      await this.sendToRobot({
        action: "showOverlay",
        text: i.toString(),
        duration: 900,
      });
      console.log(`${i}...`);
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Show recording message
    await this.sendToRobot({
      action: "showOverlay",
      text: "RECORDING!",
      duration: 0,
    });

    const pos = await this.sendToRobot({ action: "getMousePosition" });

    // Show recorded message
    await this.sendToRobot({
      action: "showOverlay",
      text: `Recorded!\n(${pos.x}, ${pos.y})`,
      duration: 2000,
    });

    console.log(`Click recorded at (${pos.x}, ${pos.y})`);

    const click = { x: pos.x, y: pos.y };
    if (targetContext !== "") {
      click.targetContext = targetContext;
    }

    // Save to current context
    const contextObj = this.getCurrentContextObj();
    contextObj.clicks[name] = click;

    this.saveClicks();
    console.log(`\nClick '${name}' saved at (${pos.x}, ${pos.y})`);
    console.log(`Location: ${this.getPrompt()}${name}`);
    if (targetContext !== "") {
      console.log(`Navigates to: ${targetContext}`);
    } else {
      console.log(`Navigates to: (stays in current context)`);
    }
  }

  listContents() {
    const contextObj = this.getCurrentContextObj();
    const items = [];

    // Add subcontexts
    if (contextObj.subcontexts) {
      Object.keys(contextObj.subcontexts).forEach((ctx) => {
        items.push(ctx + "/");
      });
    }

    // Add clicks
    if (contextObj.clicks) {
      Object.keys(contextObj.clicks).forEach((click) => {
        items.push(click);
      });
    }

    if (items.length === 0) {
      console.log("(empty)");
    } else {
      console.log("Contents:");
      items.forEach((item) => console.log(`  ${item}`));
    }
  }

  changeContext(dir) {
    const prevContext = [...this.currentContext];

    if (dir === "..") {
      if (this.currentContext.length > 0) {
        this.currentContext.pop();
      }
    } else if (dir.startsWith("/")) {
      // Absolute path
      this.currentContext = dir
        .substring(1)
        .split("/")
        .filter((x) => x);
    } else {
      // Relative path
      this.currentContext.push(dir);
    }

    // Verify the context exists
    try {
      let obj = this.clicks.contexts._root;
      for (const ctx of this.currentContext) {
        if (!obj.subcontexts || !obj.subcontexts[ctx]) {
          console.log(`Context '${dir}' not found`);
          this.currentContext = prevContext;
          return;
        }
        obj = obj.subcontexts[ctx];
      }
    } catch (e) {
      console.log(`Invalid context path`);
      this.currentContext = prevContext;
      return;
    }

    this.rl.setPrompt(this.getPrompt());
  }

  makeContext(name, silent = false) {
    if (!name) {
      console.log("Context name required");
      return false;
    }

    const contextObj = this.getCurrentContextObj();

    if (!contextObj.subcontexts[name]) {
      contextObj.subcontexts[name] = {
        clicks: {},
        subcontexts: {},
      };
    } else {
      console.log(`Context '${name}' already exists`);
      return false;
    }

    this.saveClicks();
    if (!silent) {
      console.log(`Context '${name}' created`);
      console.log(
        `Tip: Use 'cd ${name}' to enter this context, then 'record' to add clicks`
      );
    }
    return true;
  }

  async moveItem(itemName, targetPath) {
    const currentObj = this.getCurrentContextObj();
    let item = null;
    let isContext = false;

    // Check if it's a click or context
    if (currentObj.clicks && currentObj.clicks[itemName]) {
      item = currentObj.clicks[itemName];
      isContext = false;
    } else if (currentObj.subcontexts && currentObj.subcontexts[itemName]) {
      item = currentObj.subcontexts[itemName];
      isContext = true;
    } else {
      console.log(`Item '${itemName}' not found in current context`);
      return;
    }

    // Parse target path
    let targetContext = [];
    if (targetPath === "/") {
      targetContext = [];
    } else if (targetPath.startsWith("/")) {
      targetContext = targetPath
        .substring(1)
        .split("/")
        .filter((x) => x);
    } else {
      // Relative path from current
      targetContext = [...this.currentContext];
      const parts = targetPath.split("/");
      for (const part of parts) {
        if (part === "..") {
          targetContext.pop();
        } else if (part && part !== ".") {
          targetContext.push(part);
        }
      }
    }

    // Navigate to target and verify it exists
    let targetObj = this.clicks.contexts._root;
    for (const ctx of targetContext) {
      if (!targetObj.subcontexts || !targetObj.subcontexts[ctx]) {
        console.log(`Target context '${targetPath}' not found`);
        return;
      }
      targetObj = targetObj.subcontexts[ctx];
    }

    // Move the item
    if (isContext) {
      targetObj.subcontexts[itemName] = item;
      delete currentObj.subcontexts[itemName];
      console.log(`Moved context '${itemName}' to ${targetPath || "/"}`);
    } else {
      targetObj.clicks[itemName] = item;
      delete currentObj.clicks[itemName];
      console.log(`Moved click '${itemName}' to ${targetPath || "/"}`);
    }

    this.saveClicks();
  }

  async renameItem(oldName, newName) {
    const currentObj = this.getCurrentContextObj();

    // Check if it's a click
    if (currentObj.clicks && currentObj.clicks[oldName]) {
      currentObj.clicks[newName] = currentObj.clicks[oldName];
      delete currentObj.clicks[oldName];
      console.log(`Renamed click '${oldName}' to '${newName}'`);
      this.saveClicks();
      return;
    }

    // Check if it's a context
    if (currentObj.subcontexts && currentObj.subcontexts[oldName]) {
      currentObj.subcontexts[newName] = currentObj.subcontexts[oldName];
      delete currentObj.subcontexts[oldName];
      console.log(`Renamed context '${oldName}' to '${newName}'`);
      this.saveClicks();
      return;
    }

    console.log(`Item '${oldName}' not found in current context`);
  }

  findClick(name) {
    // Build the scope chain - current context up to root
    const scopeChain = [];
    let contextPath = [...this.currentContext];

    // Add current context
    let obj = this.clicks.contexts._root;
    for (const ctx of contextPath) {
      obj = obj.subcontexts[ctx];
    }
    scopeChain.push(obj);

    // Add parent contexts up to root
    while (contextPath.length > 0) {
      contextPath.pop();
      obj = this.clicks.contexts._root;
      for (const ctx of contextPath) {
        obj = obj.subcontexts[ctx];
      }
      scopeChain.push(obj);
    }

    // Add root if not already there
    if (
      contextPath.length === 0 &&
      scopeChain[scopeChain.length - 1] !== this.clicks.contexts._root
    ) {
      scopeChain.push(this.clicks.contexts._root);
    }

    // Search through scope chain
    for (let i = 0; i < scopeChain.length; i++) {
      const context = scopeChain[i];

      // Check current context's clicks
      if (context.clicks && context.clicks[name]) {
        return context.clicks[name];
      }

      // For parent contexts, also check sibling contexts (aunt/uncle clicks)
      if (i > 0 && context.subcontexts) {
        for (const siblingName in context.subcontexts) {
          const sibling = context.subcontexts[siblingName];
          if (sibling.clicks && sibling.clicks[name]) {
            return sibling.clicks[name];
          }
        }
      }
    }

    return null;
  }

  async executeFlow(flowName) {
    const flowPath = path.join(FLOWS_DIR, `${flowName}.json`);
    if (!fs.existsSync(flowPath)) {
      console.error(`Flow '${flowName}' not found`);
      console.log("\nAvailable flows:");
      if (fs.existsSync(FLOWS_DIR)) {
        const flows = fs
          .readdirSync(FLOWS_DIR)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(".json", ""));
        if (flows.length > 0) {
          flows.forEach((f) => console.log(`  ${f}`));
        } else {
          console.log("  (no flows found)");
        }
      }
      return;
    }

    const flow = JSON.parse(fs.readFileSync(flowPath, "utf8"));
    console.log(`Executing flow: ${flowName}`);

    const logDir = path.join(LOGS_DIR, `${flowName}_${Date.now()}`);
    fs.mkdirSync(logDir);

    let stepNum = 1;
    const flowContext = [...this.currentContext]; // Save current context

    for (const step of flow.steps) {
      const stepPrefix = String(stepNum).padStart(5, "0");
      const logFile = path.join(logDir, `${stepPrefix}-${step.type}.json`);

      try {
        console.log(`Step ${stepNum}: ${step.type}`);

        switch (step.type) {
          case "navigate":
            this.changeContext(step.path);
            break;

          case "click":
            const click = this.findClick(step.name);
            if (!click) {
              console.error(
                `Click '${step.name}' not found in current context or parent scopes`
              );
              throw new Error(`Click '${step.name}' not found`);
            }

            await this.sendToRobot({
              action: "click",
              x: click.x,
              y: click.y,
              doubleClick: step.doubleClick || false,
            });

            // Only navigate if click has a targetContext
            if (click.targetContext) {
              this.changeContext(click.targetContext);
            }
            break;

          case "setClipboard":
            await this.sendToRobot({ action: "setClipboard", text: step.text });
            // Small delay to ensure clipboard is set
            await new Promise((r) => setTimeout(r, 300));
            break;

          case "key":
            await this.sendToRobot({ action: "key", keys: step.keys });
            break;

          case "copy":
            const copyResult = await this.sendToRobot({ action: "copy" });
            step.clipboard = copyResult.clipboard;
            break;

          case "paste":
            await this.sendToRobot({ action: "paste" });
            break;

          case "pause":
            if (step.ms) {
              await new Promise((r) => setTimeout(r, step.ms));
            } else if (step.message) {
              await this.ask(`${step.message} (Press Enter to continue)`);
            }
            break;

          case "checkpoint":
            const checkpointResult = await this.executeCheckpoint(
              step.checkpoint
            );
            if (!checkpointResult) {
              throw new Error("Checkpoint failed");
            }
            break;

          case "flow":
            await this.executeFlow(step.flowName);
            break;

          case "scroll":
            await this.sendToRobot({ action: "scroll", amount: step.amount });
            break;
        }

        // Log step
        fs.writeFileSync(
          logFile,
          JSON.stringify({ step, success: true }, null, 2)
        );

        // Take screenshot
        await this.sendToRobot({
          action: "screenshot",
          filename: path.join(logDir, `${stepPrefix}-screenshot.png`),
        });

        stepNum++;
      } catch (error) {
        console.error(`Step ${stepNum} failed:`, error.message);
        fs.writeFileSync(
          logFile,
          JSON.stringify(
            { step, success: false, error: error.message },
            null,
            2
          )
        );

        // Restore context
        this.currentContext = flowContext;
        return;
      }
    }

    // Restore context
    this.currentContext = flowContext;
    console.log(`Flow '${flowName}' completed successfully`);
  }

  async executeCheckpoint(checkpoint) {
    for (const action of checkpoint.actions) {
      switch (action.type) {
        case "click":
        case "doubleClick":
          const click = this.findClick(action.name);
          if (!click) {
            console.error(`Checkpoint click '${action.name}' not found`);
            return false;
          }

          await this.sendToRobot({
            action: "click",
            x: click.x,
            y: click.y,
            doubleClick: action.type === "doubleClick",
          });
          break;

        case "copy":
          const result = await this.sendToRobot({ action: "copy" });
          if (action.expect && result.clipboard !== action.expect) {
            console.error(
              `Checkpoint failed: expected '${action.expect}', got '${result.clipboard}'`
            );
            return false;
          }
          break;

        default:
          // Handle other checkpoint actions
          break;
      }
    }
    return true;
  }

  printUsage() {
    console.log("\n=== Windows Automation CLI ===");
    console.log("\nQuick Start Example:");
    console.log("  /> mkcontext chrome      # Create a chrome context");
    console.log(
      "  /> record                # Record click (menu for navigation)"
    );
    console.log("  /> cd chrome             # Enter chrome context");
    console.log("  /chrome> record          # Record clicks within chrome");
    console.log("  /chrome> cd /            # Go back to root");
    console.log("  /> run my-flow           # Execute an automation");
    console.log("\nCommands:");
    console.log("  record         - Record click with 5 second countdown");
    console.log("  recordfast/rf  - Record click with 2 second countdown");
    console.log(
      "  ls            - List contexts and clicks in current context"
    );
    console.log("  cd <path>     - Change context (cd .., cd /, cd chrome)");
    console.log("  mkcontext <n> - Create new context");
    console.log("  move <i> <p>  - Move item to target parent context");
    console.log("  rename <o> <n>- Rename click or context");
    console.log("  run <flow>    - Execute flow from flows/ directory");
    console.log("  clear/cls     - Clear screen and show help");
    console.log("  help / ?      - Show this help");
    console.log("  exit          - Quit");
    console.log("\nTips:");
    console.log("  - Clicks are always saved in current context");
    console.log('  - Type "cancel" during prompts to abort');
    console.log(
      "  - Navigation menu lets you choose target context or create new"
    );
    console.log(
      "  - Clicks can access parent and sibling contexts (scope chain)"
    );
    console.log("\nCurrent context: " + this.getPrompt());
    console.log("");
  }

  async processCommand(line) {
    const [cmd, ...args] = line.trim().split(" ");

    switch (cmd) {
      case "record":
        await this.recordClick(5);
        break;

      case "recordfast":
      case "rf":
        await this.recordClick(2);
        break;

      case "ls":
        this.listContents();
        break;

      case "cd":
        if (args[0]) {
          this.changeContext(args[0]);
        } else {
          console.log("Current context: " + this.getPrompt());
        }
        break;

      case "mkcontext":
        if (args[0]) {
          this.makeContext(args[0], false);
        } else {
          const name = await this.ask('Context name (or "cancel"): ');
          if (name && name.toLowerCase() !== "cancel") {
            this.makeContext(name, false);
          } else {
            console.log("Context creation cancelled");
          }
        }
        break;

      case "move":
        if (args.length >= 2) {
          await this.moveItem(args[0], args.slice(1).join(" "));
        } else {
          console.log("Usage: move <item> <target-parent>");
          console.log("Example: move new-tab /chrome/tabs");
          console.log("Example: move devtools /");
        }
        break;

      case "rename":
        if (args.length >= 2) {
          await this.renameItem(args[0], args.slice(1).join(" "));
        } else {
          console.log("Usage: rename <old-name> <new-name>");
          console.log("Example: rename new-tab create-tab");
          console.log("Example: rename devtools developer-tools");
        }
        break;

      case "run":
        if (args[0]) {
          await this.executeFlow(args[0]);
        } else {
          console.log("Usage: run <flow-name>");
          console.log("\nAvailable flows:");
          if (fs.existsSync(FLOWS_DIR)) {
            const flows = fs
              .readdirSync(FLOWS_DIR)
              .filter((f) => f.endsWith(".json"))
              .map((f) => f.replace(".json", ""));
            if (flows.length > 0) {
              flows.forEach((f) => console.log(`  ${f}`));
            } else {
              console.log("  (no flows found in flows/ directory)");
            }
          } else {
            console.log("  (flows/ directory not found)");
          }
        }
        break;

      case "clear":
      case "cls":
        console.clear();
        this.printUsage();
        break;

      case "help":
      case "?":
        this.printUsage();
        break;

      case "exit":
        this.cleanup();
        process.exit(0);
        break;

      default:
        if (cmd) {
          console.log(`Unknown command: ${cmd}`);
          console.log('Type "?" or "help" for usage instructions');
        }
    }
  }

  cleanup() {
    if (this.javaProcess) {
      this.javaProcess.kill();
    }
    if (fs.existsSync(INPUT_FILE)) fs.unlinkSync(INPUT_FILE);
    if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);
  }

  start() {
    this.printUsage();
    this.rl.prompt();

    this.rl.on("line", async (line) => {
      await this.processCommand(line);
      this.rl.prompt();
    });

    this.rl.on("close", () => {
      this.cleanup();
      process.exit(0);
    });

    process.on("SIGINT", () => {
      this.cleanup();
      process.exit(0);
    });
  }
}

new AutomationCLI();
