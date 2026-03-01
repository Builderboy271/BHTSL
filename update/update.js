import { request as axios } from "axios";
import Settings from "../utils/config";

function versionCompare(myVersion, minimumVersion) {

    var v1 = myVersion.split("."), v2 = minimumVersion.split("."), minLength;

    minLength = Math.min(v1.length, v2.length);

    for (i = 0; i < minLength; i++) {
        if (Number(v1[i]) > Number(v2[i])) {
            return true;
        }
        if (Number(v1[i]) < Number(v2[i])) {
            return false;
        }
    }

    return (v1.length >= v2.length);
}

let load = register("worldLoad", () => {
    try {
        axios({
            url: "https://raw.githubusercontent.com/Builderboy271/BHTSL/main/metadata.json",
            method: 'GET'
        }).then(response => {
            const latestVersion = response.data.version;
            const currentVersion = JSON.parse(FileLib.read("BHTSL", "./metadata.json")).version;
            if (versionCompare(currentVersion, latestVersion)) {
                if (Settings.loadMessage) ChatLib.chat(`&3[BHTSL] &fLoaded successfully!`);
                return;
            }
            ChatLib.chat(new Message(new TextComponent("&3[BHTSL] &fNew BHTSL version available!").setClick("open_url", "https://github.com/Builderboy271/BHTSL/releases")));
    
        });
    } catch (error) {
        ChatLib.chat("&3[BHTSL] &cError while checking version");
    }
    load.unregister();
});

function directoryExists(directoryPath) {
    let dir = new java.io.File(directoryPath);
    return dir.exists() && dir.isDirectory();
}

if (!directoryExists("./config/ChatTriggers/modules/BHTSL/imports")) {
    FileLib.write("BHTSL", "./imports/default.htsl", "playerWeather Raining\nplayerTime 1000\n\n// Does anyone even read this?\nteamstat test Blue set 12\nteamvar test Blue set 12 false\nglobalstat test set 12\nglobalvar test set 12 false\nstat test set 12\nvar test set 12 false", true);
    FileLib.write("BHTSL", "./imports/stone.json", "{\"item\": \"{id:\\\"minecraft:stone\\\",Count:1b,Damage:0s}\"}", true);

}
