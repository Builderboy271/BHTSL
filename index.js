if (FileLib.exists("HTSL", "./metadata.json")) {
    ChatLib.chat("&3[BHTSL] &cError while loading");
    ChatLib.chat("&3[BHTSL] &eBHTSL is incompatible with HTSL! Please remove HTSL from your modules folder.")
    throw new Error("BHTSL is incompatible with HTSL! Please remove HTSL from your modules folder.");
}

import { getSubDir } from './gui/LoadActionGUI';
import Config from "./utils/config";
import codeWindow from './gui/codeWindow';
import { preProcess } from './compiler/compile';
import { addOperation, isWorking, setExportChainStatus, resetExportChainStatus, isExportChainCanceled } from './gui/Queue';
import Navigator from './gui/Navigator';
import { checkVersion } from "./update/update";
import getItemFromNBT from './utils/getItemFromNBT';
import loadItemstack from './utils/loadItemstack';
import { loadAction } from './compiler/loadAction';
import exportAction from './compiler/exportAction';
import { compile } from './compiler/compile';
import Settings from './utils/config';
import request from 'requestV2';

const FileOutputStream = Java.type("java.io.FileOutputStream");
const File = Java.type("java.io.File");
const Channels = Java.type("java.nio.channels.Channels");
const Long = Java.type("java.lang.Long");

let waitingForTabComplete = false;
let tabCompleteTimeout = null;
let chainExportOffset = 0;
let exportTarget = 'function';

register("command", ...args => {
    let command;
    try {
        command = args[0].toLowerCase();
    } catch (e) {
        command = 'help';
    }

    if (Settings.disableBHTSLFeatures) {
        if (command === 'enable' || command === 'disable') {
            Settings.disableBHTSLFeatures = false;
            ChatLib.chat("&3[BHTSL] &aBHTSL features have been enabled!");
        } else {
            ChatLib.chat("&3[BHTSL] &cBHTSL features are currently disabled! Use '/bhtsl enable' to re-enable them!");
        }
    } else {
        if (command === 'disable') {
            Settings.disableBHTSLFeatures = true;
            ChatLib.chat("&3[BHTSL] &cBHTSL features have been disabled! Use '/bhtsl enable' to re-enable them!");
            return;
        }
        if (command === 'enable') {
            ChatLib.chat("&3[BHTSL] &aBHTSL features are already enabled!");
            return;
        }
        if (command === 'config') return Config.openGUI();
        if (command === 'edit') {
            args.shift();
            return codeWindow(`${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${args.join(' ')}`);
        }
        if (command === 'changelog') {
            ChatLib.chat("&3[BHTSL] &7v&f" + JSON.parse(FileLib.read("BHTSL", "./metadata.json")).version + "&e Changes:");
            ChatLib.chat("");
            const changelog = FileLib.read("./config/ChatTriggers/modules/BHTSL/update/changelog.txt").split("\n").slice(2);
            changelog.forEach(line => {
                ChatLib.chat("&8" + line.trim().slice(0, 1) + "&f" + line.trim().slice(1));
            });
            ChatLib.chat("");
            checkVersion();
            return;
        }
        if (command === 'saveitem') {
            if (args.length < 2) return ChatLib.chat("&3[BHTSL] &cPlease enter a filename to save it to!");
            let itemHeld = Player.getHeldItem().getNBT().toString().replace(/["]/g, '\\$&');
            FileLib.write(`./config/ChatTriggers/modules/BHTSL/imports/${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${Settings.itemPrefix.length > 1 ? Settings.itemPrefix + "/" : ""}${args[1]}.json`, `{"item": "${itemHeld}"}`, true);
            return ChatLib.chat(`&3[BHTSL] &fSaved item to ${args[1]}.json`);
        }
        if (command === "addfunctions") {
            if (args.length == 1) return ChatLib.chat("&3[BHTSL] &cPlease add a filename!");
            args.shift();
            let file = args.join(" ");
            if (FileLib.exists(`./config/ChatTriggers/modules/BHTSL/imports/${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${file}.htsl`)) {
                Navigator.isReady = true;
                preProcess(FileLib.read(`./config/ChatTriggers/modules/BHTSL/imports/${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${file}.htsl`).split("\n")).filter(n => n.context == "FUNCTION").forEach((context, index) => {
                    if (index > 0) addOperation({ type: 'closeGui' });
                    if (index > 0) addOperation({ type: 'wait', time: 1500 });
                    addOperation({ type: 'chat', text: `/function edit ${context.contextTarget.name}`, func: context.contextTarget.name, command: true });
                });
                addOperation({ type: 'closeGui' });
                addOperation({ type: 'done' });
                return;
            } else {
                return ChatLib.chat("&3[BHTSL] &cFile not found!");
            }
        }
        if (command === "listscripts") {
            let files;
            if (args.length == 1) {
                files = readDir(`./config/ChatTriggers/modules/BHTSL/imports/${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}`, false).filter(e => e.endsWith("htsl") || e.endsWith("\\"));
            } else {
                args.shift();
                files = readDir(`./config/ChatTriggers/modules/BHTSL/imports/${args.join(" ")}/`, false);
            }
            files.filter(e => e.endsWith("\\")).forEach(directory => {
                ChatLib.chat(`&3Directory: &f${directory.substring(0, directory.length - 1)}`);
            })
            ChatLib.chat("\n&3[BHTSL] &fMain Directory:\n");
            return files.filter(e => e.endsWith(".htsl")).forEach(file => {
                ChatLib.chat(file);
            });
        }
        if (command === "version") {
            ChatLib.chat(`&3[BHTSL] &7v&f${JSON.parse(FileLib.read("BHTSL", "./metadata.json")).version}`);
            checkVersion();
            return;
        }
        if (command === "giveitem") {
            if (Player.asPlayerMP().player.field_71075_bZ.field_75098_d === false) {
                World.playSound('mob.villager.no', 0.5, 1);
                return ChatLib.chat(`&3[BHTSL] &cMust be in creative mode to import an item!`);
            }
            args.shift();
            let nbt = JSON.parse(FileLib.read('BHTSL', `/imports/${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${Settings.itemPrefix.length > 1 ? Settings.itemPrefix + "/" : ""}${args.join(" ")}.json`)).item;
            let item = getItemFromNBT(nbt);
            let slot = Player.getInventory().getItems().indexOf(null);
            if (slot < 9) slot += 36;
            loadItemstack(item.getItemStack(), slot);
            return;
        }
        if (command === "import") {
            if (args.length == 1) return ChatLib.chat("&3[BHTSL] &cPlease add a filename!");
            args.shift();
            let file = args.join(" ");
            if (FileLib.exists(`./config/ChatTriggers/modules/BHTSL/imports/${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${file}.htsl`)) {
                Navigator.isReady = true;
                let actions = compile(`${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${file}`, [], true);
                actions = actions.filter(n => n.context !== "DEFAULT");
                loadAction(actions, Settings.deleteOnCommandImport);
                return;
            } else {
                ChatLib.chat("&3[BHTSL] &cFile not found!");
                return;
            }
        }
        if (command === "exportallfunctions") {
            if (args.length == 1){
                chainExportOffset = 0;
            } else {
                chainExportOffset = parseInt(args[1]);
            }

            exportTarget = 'function';

            const C14PacketTabComplete = Java.type("net.minecraft.network.play.client.C14PacketTabComplete");
            const packet = new C14PacketTabComplete("/function run ");
            Client.sendPacket(packet);
            waitingForTabComplete = true;
            
            tabCompleteTimeout = setTimeout(() => {
                if (waitingForTabComplete) {
                    ChatLib.chat("&3[BHTSL] &cTimed out while waiting for function list.");
                    waitingForTabComplete = false;
                }
            }, 5000);
            return;
        }
        if (command === "exportallcommands") {
            if (args.length == 1) {
                chainExportOffset = 0;
            } else {
                chainExportOffset = parseInt(args[1]);
            }

            exportTarget = 'command';

            const C14PacketTabComplete = Java.type("net.minecraft.network.play.client.C14PacketTabComplete");
            const packet = new C14PacketTabComplete("/command edit ");
            Client.sendPacket(packet);
            waitingForTabComplete = true;

            tabCompleteTimeout = setTimeout(() => {
                if (waitingForTabComplete) {
                    ChatLib.chat("&3[BHTSL] &cTimed out while waiting for command list.");
                    waitingForTabComplete = false;
                }
            }, 5000);
            return;
        }
        if (command === "installupdate") {
            request("https://api.github.com/repos/Builderboy271/BHTSL/releases/latest").then(response => {
                const author = JSON.parse(response).author.id;
                if (author !== 257887200) {
                    ChatLib.chat("&3[BHTSL] &cInvalid author id &e" + author);
                    return;
                }

                const modulePath = "./config/ChatTriggers/modules/";

                ChatLib.chat("&3[BHTSL] &fDownloading latest update...");

                downloadFile("https://github.com/Builderboy271/BHTSL/releases/latest/download/BHTSL.zip", modulePath + "BHTSL_new/BHTSL.zip");
                const mainDir = new File(modulePath + "BHTSL");

                ChatLib.chat("&3[BHTSL] &eDeleting old files...");

                if (mainDir.exists() && mainDir.isDirectory()) {
                    mainDir.listFiles().forEach(file => {
                        const name = file.getName();
                        if (name !== "imports" && name !== "config.toml") {
                            if (file.isDirectory()) {
                                FileLib.deleteDirectory(file.getAbsolutePath());
                            } else {
                                file.delete();
                            }
                        }
                    });
                }

                ChatLib.chat("&3[BHTSL] &dInstalling update...");

                FileLib.unzip(modulePath + "BHTSL_new/BHTSL.zip", modulePath);
                FileLib.deleteDirectory(modulePath + "BHTSL_new");

                ChatLib.chat("&3[BHTSL] &bReloading Chattriggers...");

                ChatTriggers.loadCT();
            }).catch(error => {
                ChatLib.chat("&3[BHTSL] &cError fetching latest update");
            });
            return;
        }
        if (command === 'help') {
            ChatLib.chat("&8&m" + ChatLib.getChatBreak());
            ChatLib.chat("&6/bhtsl disable &7Disables the mod until '/bhtsl enable' is run");
            ChatLib.chat("&6/bhtsl edit <script name> &7Opens a window for editing scripts");
            ChatLib.chat("&6/bhtsl config &7Opens the settings menu for BHTSL");
            ChatLib.chat("&6/bhtsl changelog &7Shows you all significant changes made in the last update");
            ChatLib.chat("&6/bhtsl saveitem <filename> &7Save an item to import");
            ChatLib.chat("&6/bhtsl addfunctions <filename> &7Imports all the required functions to prepare for import");
            ChatLib.chat("&6/bhtsl listscripts &7Lists all your scripts");
            ChatLib.chat("&6/bhtsl version &7Returns your current BHTSL version");
            ChatLib.chat("&6/bhtsl giveitem <filename> &7Gives you an item from your imports");
            ChatLib.chat("&6/bhtsl import <filename> &7Imports given file (ignores default context)");
            ChatLib.chat("&6/bhtsl exportallfunctions <offset> &7Exports all house functions");
            ChatLib.chat("&6/bhtsl exportallcommands <offset> &7Exports all house commands");
            ChatLib.chat("&6/bhtsl installupdate &7Downloads and installs the latest update (can be used to reinstall)");
            ChatLib.chat("&8&m" + ChatLib.getChatBreak());
            return;
        }
        if (command === '_latestchangelog') {
            request("https://api.github.com/repos/Builderboy271/BHTSL/releases/latest").then(response => {
                const changelog = JSON.parse(response).body.split("\n");

                ChatLib.chat("&3[BHTSL] &7v&f" + JSON.parse(response).tag_name.replace("v", "") + "&e Changes:");
                ChatLib.chat("");
                changelog.forEach(line => {
                    ChatLib.chat("&8" + line.trim().slice(0, 1) + "&f" + line.trim().slice(1));
                });
                ChatLib.chat("");
            }).catch(error => {
                ChatLib.chat("&3[BHTSL] &cError fetching latest changelog");
            });
            return;
        } else {
            ChatLib.chat('&3[BHTSL] &fUnknown command! Try /bhtsl for help!');
        }
    }
}).setTabCompletions("help", "edit", "config", "guide", "changelog", "saveitem", "addfunctions", "listscripts", "version", "giveitem", "import", "exportallfunctions", "exportallcommands", "installupdate").setName('bhtsl').setAliases(['htsl', 'bht', 'ht']);

register("packetReceived", (packet, event) => {
    if (!Settings.disableBHTSLFeatures) {
        if (Settings.noCursorWipe) {
            if (Player.asPlayerMP() !== null) {
                if (Player.asPlayerMP().player.field_71075_bZ.field_75098_d) {
                    if (Player.getContainer().getClassName() == "ContainerCreative") {
                        if (packet.class.getName() == "net.minecraft.network.play.server.S2FPacketSetSlot") {
                            if (packet.func_149174_e() == null && packet.func_149173_d() == -1 && packet.func_149175_c() == -1) {
                                cancel(event);
                            }
                        }
                    }
                }
            }
        }
    }
});

register("packetReceived", (packet) => {
    if (!Settings.disableBHTSLFeatures && waitingForTabComplete) {
        const completions = packet.func_149630_c();
        
        waitingForTabComplete = false;
        if (tabCompleteTimeout) {
            clearTimeout(tabCompleteTimeout);
            tabCompleteTimeout = null;
        }

        let names = completions.splice(chainExportOffset);
        if (exportTarget === 'command') {
            exportCommandsSequentially(names);
        } else {
            exportFunctionsSequentially(names);
        }
    }
}).setFilteredClass(Java.type("net.minecraft.network.play.server.S3APacketTabComplete"));

function exportFunctionsSequentially(functionNames) {
    let index = 0;
    resetExportChainStatus();

    const runNext = () => {
        if (isExportChainCanceled()) {
            ChatLib.chat(`&3[BHTSL] &cExport chain cancelled.`);
            resetExportChainStatus();
            return;
        }

        if (index >= functionNames.length) {
            ChatLib.chat(`&3[BHTSL] &aFinished exporting ${functionNames.length} function${functionNames.length === 1 ? "" : "s"}.`);
            resetExportChainStatus();
            return;
        }

        const funcName = functionNames[index];
        index++;
        setExportChainStatus(true, index, functionNames.length);

        // open the function in-editor
        ChatLib.command(`function edit ${funcName}`);

        // wait for the action GUI to open (so exportAction can read the container)
        const waitForGui = (attempts = 0) => {
            if (isExportChainCanceled()) {
                ChatLib.chat(`&3[BHTSL] &cExport chain cancelled.`);
                resetExportChainStatus();
                return;
            }

            const container = Player.getContainer();
            const hasActionGui = container && container.getName && container.getName().match(/Edit Actions|Actions: /);
            if (hasActionGui) {
                // build file name using saveDirectory setting and subdir
                const base = (Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : "") + "all_functions/";
                // sanitize filename: convert any slashes to underscores and sanitize
                const sanitize = (s) => s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").trim();
                // replace slashes/backslashes with underscores so directories are not created
                let namePart = funcName.replace(/[\\/]+/g, "_");
                namePart = sanitize(namePart);
                const fileName = base + namePart;
                try {
                    const header = Settings.exportAllAddGotoHeader ? `goto function "${funcName}"` : null;
                    exportAction(fileName, header);
                } catch (e) {
                    ChatLib.chat(`&3[BHTSL] &cFailed to export ${funcName}: ${e}`);
                }

                // wait for export to finish
                const waitForFinish = () => {
                    if (isExportChainCanceled()) {
                        ChatLib.chat(`&3[BHTSL] &cExport chain cancelled.`);
                        resetExportChainStatus();
                        return;
                    }

                    if (!isWorking()) {
                        ChatLib.chat(`&3[BHTSL] &aExported &f${funcName} &ato &f${fileName},htsl`);
                        setTimeout(runNext, 0);
                    } else {
                        setTimeout(waitForFinish, 50);
                    }
                };
                waitForFinish();
                return;
            }

            // timeout after a reasonable number of attempts (~5s)
            if (attempts > 100) {
                ChatLib.chat(`&3[BHTSL] &cTimed out opening function ${funcName}. Skipping.`);
                setTimeout(runNext, 0);
                return;
            }
            setTimeout(() => waitForGui(attempts + 1), 50);
        };

        waitForGui();
    };

    // start immediately
    runNext();
}

function exportCommandsSequentially(commandNames) {
    let index = 0;
    resetExportChainStatus();

    const runNext = () => {
        if (isExportChainCanceled()) {
            ChatLib.chat(`&3[BHTSL] &cExport chain cancelled.`);
            resetExportChainStatus();
            return;
        }

        if (index >= commandNames.length) {
            ChatLib.chat(`&3[BHTSL] &aFinished exporting ${commandNames.length} command${commandNames.length === 1 ? "" : "s"}.`);
            resetExportChainStatus();
            return;
        }

        const cmdName = commandNames[index];
        index++;
        setExportChainStatus(true, index, commandNames.length);

        // open the command in-editor
        ChatLib.command(`command actions ${cmdName}`);

        // wait for the action GUI to open (so exportAction can read the container)
        const waitForGui = (attempts = 0) => {
            if (isExportChainCanceled()) {
                ChatLib.chat(`&3[BHTSL] &cExport chain cancelled.`);
                resetExportChainStatus();
                return;
            }

            const container = Player.getContainer();
            const hasActionGui = container && container.getName && container.getName().match(/Edit Actions|Actions: /);
            if (hasActionGui) {
                // build file name using saveDirectory setting and subdir
                const base = (Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : "") + "all_commands/";
                // sanitize filename: convert any slashes to underscores and sanitize
                const sanitize = (s) => s.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").trim();
                // replace slashes/backslashes with underscores so directories are not created
                let namePart = cmdName.replace(/[\\/]+/g, "_");
                namePart = sanitize(namePart);
                const fileName = base + namePart;
                try {
                    const header = Settings.exportAllAddGotoHeader ? `goto command "${cmdName}"` : null;
                    exportAction(fileName, header);
                } catch (e) {
                    ChatLib.chat(`&3[BHTSL] &cFailed to export ${cmdName}: ${e}`);
                }

                // wait for export to finish
                const waitForFinish = () => {
                    if (isExportChainCanceled()) {
                        ChatLib.chat(`&3[BHTSL] &cExport chain cancelled.`);
                        resetExportChainStatus();
                        return;
                    }

                    if (!isWorking()) {
                        ChatLib.chat(`&3[BHTSL] &aExported &f${cmdName} &ato &f${fileName},htsl`);
                        setTimeout(runNext, 0);
                    } else {
                        setTimeout(waitForFinish, 50);
                    }
                };
                waitForFinish();
                return;
            }

            // timeout after a reasonable number of attempts (~5s)
            if (attempts > 100) {
                ChatLib.chat(`&3[BHTSL] &cTimed out opening command ${cmdName}. Skipping.`);
                setTimeout(runNext, 0);
                return;
            }
            setTimeout(() => waitForGui(attempts + 1), 50);
        };

        waitForGui();
    };

    runNext();
}

function readDir(path, walk) {
    let files = new java.io.File(path).listFiles();
    let fileNames = [];

    files.forEach(file => {
        if (file.isDirectory()) {
            if (walk) {
                readDir(path + file.getName() + "/", false).forEach(newFile => {
                    const fileName = getMatchedFileName(path, `${file}\\${newFile}`);

                    if (fileName) fileNames.push(fileName);
                });
            } else {
                const fileName = getMatchedFileName(path, file.toString());

                if (fileName) fileNames.push(`${fileName}\\`);
            }
        } else {
            const fileName = getMatchedFileName(path, file.toString());

            if (fileName) fileNames.push(fileName);
        }
    });
    return fileNames;
}

function getMatchedFileName(path, filePath) {
    const formattedPath = path.replace(/\//g, "\\\\");
    const fileFormattedMatchRegexp = new RegExp(`${formattedPath}(.*)`);
    const formattedPathMatchArray = filePath.match(fileFormattedMatchRegexp);

    if (formattedPathMatchArray) return formattedPathMatchArray[1];

    const fileMatchRegexp = new RegExp(`${path}(.*)`);
    const pathMatchArray = filePath.match(fileMatchRegexp);

    if (pathMatchArray) return pathMatchArray[1];

    return null;
}

function downloadFile(url, destination) {
    destination = new File(destination);
    destination.getParentFile().mkdirs();
    connection = com.chattriggers.ctjs.CTJS.INSTANCE.makeWebRequest(url);

    const is = connection.getInputStream();
    rbc = Channels.newChannel(is);
    fos = new FileOutputStream(destination);
    fos.getChannel().transferFrom(rbc, 0, Long.MAX_VALUE);
    fos.close();
    is.close();
};

let load = register("worldLoad", () => {
    if (Settings.loadMessage) {
        ChatLib.chat("&3[BHTSL] &fLoaded successfully! &7v&f" + JSON.parse(FileLib.read("BHTSL", "./metadata.json")).version);
        if (Settings.disableBHTSLFeatures) {
            ChatLib.chat("&3[BHTSL] &cBHTSL features are currently disabled! Use '/bhtsl enable' to re-enable them!");
        }
    }

    if (!Settings.disableBHTSLFeatures && Settings.startupVersionCheck) setTimeout(() => {
        checkVersion();
    }, 3000);

    load.unregister();
});