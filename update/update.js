import request from "requestv2";
import Settings from "../utils/config";

let newVersionShown = false;
const currentVersion = JSON.parse(FileLib.read("BHTSL", "./metadata.json")).version;
const currentSplit = currentVersion.split(".");

export const checkVersion = () => {
    request("https://api.github.com/repos/Builderboy271/BHTSL/releases/latest").then(response => {
        const latestVersion = JSON.parse(response).tag_name.replace("v", "");
        const latestSplit = latestVersion.split(".");
        
        for (var i = 0; i < 3; i++) {
            if (Number(currentSplit[i]) < Number(latestSplit[i])) {
                newVersionShown = true;

                ChatLib.chat("&3[BHTSL] &aNew BHTSL version available! &7v&f" + currentVersion + "&a -> &7v&f" + latestVersion);
                ChatLib.chat(new Message(
                    "&3[BHTSL] ",
                    new TextComponent("&6[&eView changelog&6]").setClick("run_command", "/bhtsl latestchangelog"),
                    " ",
                    new TextComponent("&5[&dGithub&5]").setClick("open_url", "https://github.com/Builderboy271/BHTSL/releases/latest"),
                    " ",
                    new TextComponent("&2[&aDirect download&2]").setClick("open_url", "https://github.com/Builderboy271/BHTSL/releases/latest/download/BHTSL.zip")
                ));
                break;
            }
        }
    }).catch(error => {
        ChatLib.chat("&3[BHTSL] &cError while starting version check");
    });
};

register("step", () => {
    if (Settings.periodicVersionCheck && !newVersionShown) checkVersion();
}).setDelay(1800);