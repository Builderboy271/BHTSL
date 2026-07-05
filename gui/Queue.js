import Navigator from "./Navigator";
import { Button } from "./GuiBuilder";
import Settings from "../utils/config";

let queue = [];
let fails = [];
let timeWithoutOperation = 0;
let operationTimes = { started: 0, total: 0 };
let currentGuiContext = null;
let exportChainStatus = { active: false, current: 0, total: 0 };
let exportChainCancelRequested = false;

register("tick", () => {
    if (queue.length > 0) timeWithoutOperation++;
    if (
        (timeWithoutOperation > Settings.guiTimeout) && (queue.length > 0) &&
        !Settings.useSafeMode && !Navigator.goto
    ) {
        fails.push(`&cOperation timed out. &f(too long without GUI click)`);
        doneLoading();
    }
    if (!Navigator.isReady) return;
    if (queue.length === 0) return;
    timeWithoutOperation = 0;
    if (Navigator.isReturningToEdit) return Navigator.returnToEditActions();
    if (Navigator.isReturningToSettings) return Navigator.returnToActionSettings();
    if (Navigator.isSelecting) {
        const attemptResult = Navigator.selectOption(Navigator.optionBeingSelected);
        if (attemptResult === false)
            fails.push(`&cCouldn't find option &f${Navigator.optionBeingSelected} &cin &f${currentGuiContext}&c.`);
        return;
    }
    if (Navigator.isDeleting && Navigator.isReady) {
        const attemptResult = Navigator.deleteAction(Navigator.optionBeingSelected);
        if (attemptResult === false) Navigator.isDeleting = false;
        return;
    }

    if (operationTimes.started === 0) operationTimes.started = Date.now();
    operationTimes.total++;
    if (Navigator.goto) operationTimes.started += 0.05;
    let timeRemaining = Math.round(
        (((Date.now() - operationTimes.started) / operationTimes.total) *
            queue.length) /
        1000
    );
    let timeText = `Time Remaining: ${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s`;
    if (exportChainStatus.active) {
        timeText += ` | ${exportChainStatus.current}/${exportChainStatus.total}`;
    }
    timeRemainingButton.setText(timeText);

    let operation = queue.shift();
    if (operation.type === "setGuiContext") {
        currentGuiContext = operation.context; // for error messages
        if (queue.length === 0) return;
        operation = queue.shift();
    }
    Navigator.goto = false;
    switch (operation.type) {
        case "click":
            return Navigator.click(operation.slot, operation.button);
        case "input":
            return Navigator.input(operation.text);
        case "returnToEditActions":
            if (!Player.getContainer()) return;
            return Navigator.returnToEditActions();
        case "returnToActionSettings":
            if (!Player.getContainer()) return;
            return Navigator.returnToActionSettings();
        case "back":
            return Navigator.goBack();
        case "option":
            return Navigator.setSelecting(operation.option);
        case "chat":
            return Navigator.inputChat(operation.text, operation.func, operation.command);
        case "item":
            return Navigator.selectItem(operation.item);
        case "closeGui":
            if (!Player.getContainer()) return;
            return Client.currentGui.close();
        case "goto":
            Navigator.goto = true;
            ChatLib.chat(`&3[BHTSL] &fPlease open action container &e${operation.name}`);
            Navigator.isReady = false;
            return;
        case "wait":
            Navigator.isReady = false;
            return setTimeout(() => {
                Navigator.isReady = true;
            }, operation.time);
        case "export":
            return operation.func(Player.getContainer().getItems().splice(0, Player.getContainer().getSize() - 9 - 36));
        case "export_item":
            return Navigator.getItemFromAction(operation.func);
        case "done":
            return doneLoading();
        case "doneExport":
            timeWithoutOperation = 0;
            Navigator.isWorking = false;
            queue = [];
            operationTimes = { started: 0, total: 0 };
            if (Settings.playSoundOnFinish) World.playSound("random.levelup", 2, 1);
            if (Settings.closeGUI) Client.currentGui.close();
            return operation.func();
        case "doneSub":
            return operation.func();
        case "donePage":
            return operation.func();
        case "actionOrder":
            return operation.func();
        case "chat_input":
            operation.func(Navigator.getChatInput());
            ChatLib.command("chatinput cancel");
            return;
        case "deleteActions":
            return Navigator.isDeleting = true;
    }
});

function doneLoading() {
    timeWithoutOperation = 0;
    Navigator.isWorking = false;
    queue = [];
    operationTimes = { started: 0, total: 0 };
    if (Settings.playSoundOnFinish) World.playSound("random.levelup", 2, 1);
    if (Settings.closeGUI) Client.currentGui.close();

    if (fails.length > 0) {
        ChatLib.chat(
            `&cFailed to load: &f(${fails.length} error${fails.length > 1 ? "s" : ""
            })`
        );
        fails.forEach((fail) => ChatLib.chat("   > " + fail));
        fails = [];
        ChatLib.chat(
            `&f${queue.length} &coperation${queue.length !== 1 ? "s" : ""
            } left in queue.`
        );
    } else {
        ChatLib.chat(`&3[BHTSL] &fImported successfully!`);
    }
}

const timeRemainingButton = new Button(0, 0, 0, 20, "Time Remaining:");
const cancelButton = new Button(0, 100, 100, 20, "Cancel");
const reloadButton = new Button(0, Renderer.screen.getHeight() - 20, 100, 20, "Reload CT");

register("guiRender", (x, y) => {
    if (!Player.getContainer()) return;
    if (Settings.reloadButton && queue.length > 0) {
        reloadButton.setY(Renderer.screen.getHeight() - 20);
        reloadButton.render(x, y);
    }
    if (queue.length === 0) return;

    timeRemainingButton.setWidth(200);
    timeRemainingButton.setX(
        Renderer.screen.getWidth() / 2 - timeRemainingButton.getWidth() / 2
    );
    cancelButton.setX(
        Renderer.screen.getWidth() / 2 - (timeRemainingButton.getWidth() - 100) / 2
    );
    timeRemainingButton.setY(timeRemainingButton.getHeight() * 3);
    cancelButton.setY(timeRemainingButton.getHeight() * 3 + 20);
    timeRemainingButton.render(x, y);
    cancelButton.render(x, y);
});

register("guiMouseClick", (x, y) => {
    if (!Player.getContainer() || queue.length === 0) return;

    if (
        x > cancelButton.getX() &&
        x < cancelButton.getX() + cancelButton.getWidth() &&
        y > cancelButton.getY() &&
        y < cancelButton.getY() + cancelButton.getHeight()
    ) {
        cancelQueue();
        ChatLib.chat("&3[BHTSL] &cOperation cancelled.");
    }
    if (Settings.reloadButton && queue.length > 0) if (
        x > reloadButton.getX() &&
        x < reloadButton.getX() + reloadButton.getWidth() &&
        y > reloadButton.getY() &&
        y < reloadButton.getY() + reloadButton.getHeight()
    ) {
        ChatLib.command("ct load", true);
    }
});

export function addOperation(operation) {
    if (!Navigator.isWorking) {
        if (operation.type == "returnToEditActions") return;
        Navigator.isLoadingItem = false;
        Navigator.isReady = true;
    }
    Navigator.isWorking = true;
    queue.push(operation);
}
export function forceOperation(operation) {
    if (!Navigator.isWorking) {
        if (operation.type == "returnToEditActions") return;
        Navigator.isReady = true;
        Navigator.isLoadingItem = false;
    }
    Navigator.isWorking = true;
    queue.unshift(operation);
}

export function setExportChainStatus(active, current, total) {
    exportChainStatus.active = active;
    exportChainStatus.current = current;
    exportChainStatus.total = total;
    if (!active) {
        exportChainCancelRequested = false;
    }
}

export function resetExportChainStatus() {
    exportChainStatus.active = false;
    exportChainStatus.current = 0;
    exportChainStatus.total = 0;
    exportChainCancelRequested = false;
}

export function isExportChainCanceled() {
    return exportChainCancelRequested;
}

export function isExportChainActive() {
    return exportChainStatus.active;
}

export function cancelQueue() {
    queue = [];
    Navigator.isWorking = false;
    Navigator.isReady = true;
    operationTimes = { started: 0, total: 0 };
    exportChainCancelRequested = true;
    exportChainStatus.active = false;
    exportChainStatus.current = 0;
    exportChainStatus.total = 0;
}

export function isWorking() {
    return Navigator.isWorking;
};
