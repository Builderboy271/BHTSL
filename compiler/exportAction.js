import { addOperation, forceOperation, isExportChainActive } from "../gui/Queue";
import { convertJSON } from "./convertAction";
import menus from "../actions/menus";
import conditions from "../actions/conditions";

let actionobjs;
let subactions;

/**
 * Exports action data to HTSL file
 * @param {string} fileName File name to which to write exported HTSL code
 */
export default (fileName, header = null) => {
    let items = Player.getContainer().getItems();
    items = items.splice(0, Player.getContainer().getSize() - 9 - 36);
    actionobjs = [];

    if (!processPage(items, actionobjs, menus, false)) return false;

    addOperation({
        type: "doneExport", func: () => {
            let script = convertJSON([{
                context: "DEFAULT",
                contextTarget: {},
                actions: actionobjs
            }], fileName);
            let output = script.script;
            if (header) {
                if (output) {
                    output = `${header}\n${output}`;
                } else {
                    output = header;
                }
            }
            const path = `imports/${fileName}.htsl`;
            if (FileLib.exists("BHTSL", path)) {
                try {
                    const existing = FileLib.read("BHTSL", path);
                    output = existing + "\n" + output;
                } catch (e) {
                    // fallback
                }
            }
            FileLib.write("BHTSL", path, output, true);
            for (let i = 0; i < script.items.length; i++) {
                let finalName = `imports/${fileName.substring(0, fileName.lastIndexOf("/") + 1)}` + script.items[i].name + ".json";

                if (!FileLib.exists("BHTSL", finalName)) {
                    FileLib.write("BHTSL", finalName, script.items[i].string, true);
                }
            }
            if (!isExportChainActive()) ChatLib.chat(`&3[BHTSL] &aExported to &f${fileName},htsl`);
        }
    });
}

/**
 * Collects the data from an ingame page of actions
 * @param {[Item]} items List of items in the menu available 
 * @param {*} actionList JSON Object dictating the formatting of actions
 * @param {*} menuList JSON Object dictating the formatting of the ingame menu for each action
 * @param {Number} page Which page number is currently being exported, allows the macro to return to the page consistently
 * @param {boolean} condition Indicate if the current page being processed contains conditions
 * @returns {boolean} Whether or not page processing will run successfully
 */
function processPage(items, actionList, menuList, condition) {
    forceOperation({
        type: "donePage", func: () => {
            if (Player.getContainer().getItems()[Player.getContainer().getSize() - 37]) if (ChatLib.removeFormatting(Player.getContainer().getItems()[Player.getContainer().getSize() - 37].getName()) == "Left-click for next page!") {
                let nextItems = Player.getContainer().getItems();
                nextItems = nextItems.splice(0, Player.getContainer().getSize() - 9 - 36);
                forceOperation({
                    type: "export", func: (subMenuItems) => {
                        processPage(subMenuItems, actionList, menuList, condition);
                    }
                });
                forceOperation({ type: "click", slot: Player.getContainer().getSize() - 37 });
            }
        }
    });

    for (let i = items.length - 1; i >= 0; i--) {
        if (!items[i]) continue;
        let menu;
        let actionkey;
        for (let key in menuList) {
            if (menuList[key]?.condition_name == ChatLib.removeFormatting(items[i].getName())) {
                menu = menuList[key];
                actionkey = key;
                break;
            }
            if (menuList[key]?.action_name == ChatLib.removeFormatting(items[i].getName())) {
                menu = menuList[key];
                actionkey = key;
                break;
            }
        }
        if (ChatLib.removeFormatting(items[i].getName()) == "No Actions!") continue;
        if (ChatLib.removeFormatting(items[i].getName()) == "Left Click Redirect") continue; // NPC actions GUI toggle, not an action
        if (!menu) {
            ChatLib.chat(`&3[BHTSL] &cExport failed: unknown action item &e${ChatLib.removeFormatting(items[i].getName())}`);
            return false;
        }
        if (Object.keys(menu).length > 1) {
            // operations forced to the front of the queue, so they need to be added backwards
            let lore = Object.values(items[i].getLore());
            let actionobj = { type: actionkey };
            let inAction = false;
            for (let line of lore) {
                if (line === "§5§o§7§oInverted" && condition && lore.indexOf(line) !== lore.length - 1) { // Condition is inverted
                    actionobj["inverted"] = true;
                    continue;
                }
                let match = line.match(/^§5§o§7(?!(?:§7)?§o)([^:]*): ?§?f?(.*)?$/);
                if (!match) continue;
                let [property, value] = [match[1].toLowerCase().replaceAll(" ", "_"), match[2]?.replaceAll("§", "&")];
                if (property.endsWith("_name")) continue;
                if (value === "Not Set") {
                    actionobj[property] = null;
                    continue;
                }

                if (value?.length >= 30 && value?.endsWith("&7...")) { // Preview is truncated
                    if (!inAction) {
                        forceOperation({ type: "back" });
                        inAction = true;
                    }
                    forceOperation({
                        type: "export", func: (settingItems) => {
                            let slot = menu[property].slot;
                            if (condition) {
                                // Account for "Inverted" property offsetting everything
                                slot += 1;
                            }
                            if (actionkey === "CHANGE_VARIABLE" && actionobj["holder"] !== "Team" && slot > 11) {
                                // Account for "Team" property not appearing when holder is not Team
                                slot -= 1;
                            }
			    
                            let itemLore = Object.values(settingItems[slot].getLore());
                            let currentValueIndex = itemLore.indexOf("§5§o§7Current Value:");
                            let currentValue = itemLore.splice(currentValueIndex + 1, itemLore.lastIndexOf("§5§o") - currentValueIndex - 1)
                                .map(n => n.substring(6).replaceAll("§", "&"))
                                .join(" ").substring(2);

                            if (menu[property].type === "location") {
                                if (currentValue === "House Spawn Location") actionobj[property] = "house_spawn";
                                else if (currentValue === "Invokers Location") actionobj[property] = "invokers_location";
                                else actionobj[property] = `"custom_coordinates" "${currentValue.replaceAll(/(?:,|yaw: |pitch: )/g, "")}"`;
                            } else actionobj[property] = '"' + currentValue + '"';
                        }
                    });
                }

                switch (menu[property].type) {
                    case "conditions":
                    case "subactions":
                        if (lore[lore.indexOf(line) + 1] === "§5§o§7 - §cNone") { // Check if there are any conditions/subactions
                            actionobj[property] = [];
                            break;
                        }
                        if (!inAction) {
                            forceOperation({ type: "back" });
                            inAction = true;
                        }
                        forceOperation({
                            type: "doneSub", func: () => {
                                actionobj[property] = subactions;
                                subactions = [];
                            }
                        });
                        forceOperation({ type: "returnToActionSettings" });
                        forceOperation({
                            type: "export", func: (subMenuItems) => {
                                subactions = [];
                                processPage(subMenuItems, subactions, menu[property].type === "conditions" ? conditions : menus, menu[property].type === "conditions");
                            }
                        });
                        forceOperation({ type: "click", slot: menu[property].slot });
                        break;
                    case "toggle":
                        actionobj[property] = value === "&aEnabled";
                        break;
                    case "item":
                        if (!inAction) {
                            forceOperation({ type: "back" });
                            inAction = true;
                        }
                        forceOperation({
                            type: "export_item", func: (item) => {
                                actionobj[property] = item;
                            }
                        });
                        if (condition) {
                            forceOperation({ type: "click", slot: menu[property].slot + 1 });
                        } else {
                            forceOperation({ type: "click", slot: menu[property].slot });
                        }
                        break;
                    case "location":
                        if (value === "House Spawn Location") actionobj[property] = "house_spawn";
                        else if (value === "Invokers Location") actionobj[property] = "invokers_location";
                        else actionobj[property] = `"custom_coordinates" "${value.replaceAll(/(?:,|yaw: |pitch: )/g, "")}"`;
                        break;
                    default:
                        if (!value) {
                            actionobj[property] = null;
                            break;
                        }
                        if (!(value.startsWith("\"") && value.endsWith("\""))) value = value.replaceAll(",", "");
                        if (value.trim() === "" || isNaN(Number(value)) && (!value.startsWith('"') && !value.endsWith('"') && value !== "Player" && value !== "Global" && value !== "Team")) value = `"${value}"`;
                        actionobj[property] = value;
                        break;
                }
            }
            if (inAction) forceOperation({ type: "click", slot: i });
            forceOperation({
                type: "actionOrder", func: () => {
                    actionList.push(actionobj);
                }
            });
        } else {
            forceOperation({
                type: "actionOrder", func: () => {
                    actionList.push({ type: actionkey });
                }
            })
        }
    }
    return true;
}
