import request from "requestV2";
import Settings from "../utils/config";

let newVersionShown = false;
const currentVersion = JSON.parse(FileLib.read("BHTSL", "./metadata.json")).version;
const currentSplit = currentVersion.split(".");

export const checkVersion = () => {
    request("https://api.github.com/repos/Builderboy271/BHTSL/releases/latest").then(response => {
        const latestVersion = JSON.parse(response).tag_name.replace("v", "");
        const latestSplit = latestVersion.split(".");

        for (let i = 0; i < 3; i++) {
            if (Number(currentSplit[i]) < Number(latestSplit[i])) {
                newVersionShown = true;

                ChatLib.chat("&3[BHTSL] &aNew BHTSL version available! &7v&f" + currentVersion + "&a -> &7v&f" + latestVersion);
                ChatLib.chat(new Message(
                    "&3[BHTSL] ",
                    new TextComponent("&6[&eChangelog&6]").setClick("run_command", "/bhtsl _latestchangelog").setHoverValue("&eClick to view the latest changelog!"),
                    " ",
                    new TextComponent("&5[&dGithub&5]").setClick("open_url", "https://github.com/Builderboy271/BHTSL/releases/tag/v" + latestVersion).setHoverValue("&dClick to view the latest release on Github!"),
                    " ",
                    new TextComponent("&1[&9Compare to latest&1]").setClick("open_url", "https://github.com/Builderboy271/BHTSL/compare/v" + currentVersion + "...v" + latestVersion).setHoverValue("&9Click to compare your current version to the latest version on Github!"),
                    " ",
                    new TextComponent("&2[&aUpdate&2]").setClick("run_command", "/bhtsl installupdate").setHoverValue("&aClick to download and install the latest update!"),
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
