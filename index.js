if (FileLib.exists("HTSL", "./metadata.json")) {
    ChatLib.chat("&3[BHTSL] &cError while loading");
    ChatLib.chat("&3[BHTSL] &eBHTSL is incompatible with HTSL! Please remove HTSL from your modules folder.")
    throw new Error("BHTSL is incompatible with HTSL! Please remove HTSL from your modules folder.");
}

import { getSubDir } from './gui/LoadActionGUI';
import Config from "./utils/config";
import codeWindow from './gui/codeWindow';
import { convertHE } from './compiler/convertAction';
import { preProcess } from './compiler/compile';
import { addOperation } from './gui/Queue';
import Navigator from './gui/Navigator';
import { checkVersion } from "./update/update";
import getItemFromNBT from './utils/getItemFromNBT';
import loadItemstack from './utils/loadItemstack';
import { loadAction } from './compiler/loadAction';
import { compile } from './compiler/compile';
import Settings from './utils/config';
import request from 'requestv2';

if (Settings.startupVersionCheck) setTimeout(() => {
    checkVersion();
}, 3000);

register("command", ...args => {
    let command;
    try {
        command = args[0].toLowerCase();
    } catch (e) {
        command = 'help';
    }
    if (command === 'config') return Config.openGUI();
    if (command === 'gui') {
        args.shift();
        return codeWindow(`${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${args.join(' ')}`);
    }
    if (command === 'guide') {
        const guideLink = new Message(
            new TextComponent("&3[BHTSL] &fJust click this: &b&l[Guide]").setClick("open_url", "https://hypixel.net/threads/updated-guide-htsl.5555038/")
        );
        return ChatLib.chat(guideLink);
    }
    if (command === 'changelog') {
        ChatLib.chat("&3[BHTSL] &7v&f" + JSON.parse(FileLib.read("BHTSL", "./metadata.json")).version + "&e Changes:");
        ChatLib.chat("");
        const changelog = FileLib.read("./config/ChatTriggers/modules/BHTSL/update/changelog.txt").split("\n").slice(2);
        changelog.forEach(line => {
            ChatLib.chat("&8" + line.trim().slice(0, 1) + "&f" + line.trim().slice(1));
        });
        checkVersion();
        return;
    }
    if (command === 'latestchangelog') {
        request("https://api.github.com/repos/Builderboy271/BHTSL/releases/latest").then(response => {
            const changelog = JSON.parse(response).body.split("\n");

            ChatLib.chat("&3[BHTSL] &7v&f" + JSON.parse(response).tag_name.replace("v", "") + "&e Changes:");
            ChatLib.chat("");
            changelog.forEach(line => {
                ChatLib.chat("&8" + line.trim().slice(0, 1) + "&f" + line.trim().slice(1));
            });
        }).catch (error => {
            ChatLib.chat("&3[BHTSL] &cError fetching latest changelog");
        });
        return;
    }
    if (command === 'saveitem') {
        if (args.length < 2) return ChatLib.chat("&3[BHTSL] &cPlease enter a filename to save it to!");
        let itemHeld = Player.getHeldItem().getNBT().toString().replace(/["]/g, '\\$&');
        FileLib.write(`./config/ChatTriggers/modules/BHTSL/imports/${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${Settings.itemPrefix.length > 1 ? Settings.itemPrefix + "/" : ""}${args[1]}.json`, `{"item": "${itemHeld}"}`, true);
        return ChatLib.chat(`&3[BHTSL] &fSaved item to ${args[1]}.json`);
    }
    if (command === 'convert') {
        if (args.length < 3) return ChatLib.chat("&3[BHTSL] &cPlease enter the action id and then the filename to save it to!");
        convertHE(args[1], args[2]);
        return ChatLib.chat(`&3[BHTSL] &fConverting action into HTSL script saved at ${Settings.saveDirectory ? getSubDir().replace(/\\+/g, "/") : ""}${args[2]}.htsl`);
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
    if (command === 'help') {
        ChatLib.chat('&8&m-------------------------------------------------');
        ChatLib.chat('&6/bhtsl help &7Opens the BHTSL help menu!')
        ChatLib.chat('&6/bhtsl gui <script name> &7Opens a window for editing scripts!');
        ChatLib.chat('&6/bhtsl config &7Opens the settings menu for BHTSL!');
        ChatLib.chat('&6/bhtsl guide &7Opens a syntax guide!');
        ChatLib.chat('&6/bhtsl changelog &7Shows you all the significant changes made in the last update!');
        ChatLib.chat('&6/bhtsl saveitem <filename> &7Save an item to import!');
        ChatLib.chat('&6/bhtsl convert <action id> <filename> &7Converts a HousingEditor action to BHTSL!');
        ChatLib.chat('&6/bhtsl addfunctions <filename> &7Imports all the required functions to prepare for import!');
        ChatLib.chat('&6/bhtsl listscripts &7Lists all your scripts');
        ChatLib.chat('&6/bhtsl version &7Returns your current BHTSL version');
        ChatLib.chat('&6/bhtsl giveitem <filename> &7Gives you an item from your imports');
        ChatLib.chat('&6/bhtsl import <filename> &7Imports given file (ignores default context)');
        ChatLib.chat('&8&m-------------------------------------------------');
    } else {
        ChatLib.chat('&3[BHTSL] &fUnknown command! Try /bhtsl for help!');
    }
}).setName('bhtsl').setAliases(['htsl', 'bht', 'ht']);

/**
 * Obtains a list of file names from a directory.
 * @param {string} path The path to the directory to walk.
 * @param {boolean} walk `true` if the function should walk deeper into directories.
 * @returns
 */
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


