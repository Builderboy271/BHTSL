import { @Vigilant @SliderProperty @SwitchProperty @NumberProperty @TextProperty @ButtonProperty @SliderProperty @CheckboxProperty } from 'Vigilance';

@Vigilant("BHTSL", `BHTSL`, {
	getCategoryComparator: () => (a, b) => {
		const categories = ["General", "Importing/Exporting", "Import Menu"];

		return categories.indexOf(a.name) - categories.indexOf(b.name);
	},
})
class Settings {

	// General

	@SwitchProperty({
		name: "Load Message",
		description: 'Toggles whether or not the load message shows. Doesn\'t disable update-check',
		category: "General",
		subcategory: "General",
	})
	loadMessage = true;

	@SwitchProperty({
		name: "Delete Existing Actions on Command Import",
		description: 'Before importing using the command, BHTSL will delete any existing actions in the first non-default context',
		category: "General",
		subcategory: "General",
	})
	deleteOnCommandImport = false;

	@SwitchProperty({
		name: "Close GUI on Exit",
		description: 'Closes the GUI when it finishes an import or exits due to error/cancelation',
		category: "General",
		subcategory: "General",
	})
	closeGUI = true;

	@SwitchProperty({
		name: "Play Sound on Exit",
		description: 'Play a sound when the import finishes',
		category: "General",
		subcategory: "General",
	})
	playSoundOnFinish = true;

	@SwitchProperty({
		name: "Cancel Sounds while Importing/Exporting",
		description: 'Prevents sounds from playing while importing/Exporting',
		category: "General",
		subcategory: "General",
	})
	cancelSounds = true;

	@SwitchProperty({
		name: "Check for new version on startup",
		description: "Checks if there is a new version of BHTSL published on Github when chattriggers is loaded",
		category: "General",
		subcategory: "General",
	})
	startupVersionCheck = true;

	@SwitchProperty({
		name: "Check for new version periodically",
		description: "Checks if there is a new version of BHTSL published on Github every 30 minutes",
		category: "General",
		subcategory: "General",
	})
	periodicVersionCheck = true;

	@SwitchProperty({
		name: "Emergency reload button",
		description: 'Reloads chattriggers in case of softlock. Mainly use for debugging.',
		category: "General",
		subcategory: "General",
	})
	reloadButton = false;

	// Importing/Exporting 

    @TextProperty({
        name: "Item Path Prefix",
        description: "Modifies where BHTSL looks for/places item references (e.g. \"items\" will look in /project folder/items/)",
        category: "Importing/Exporting",
        subcategory: "Importing/Exporting"
    })
    itemPrefix = "";

	@SwitchProperty({
		name: "Safe Mode",
		description: 'Will show you where to click while loading in an action, this requires manual input and is no longer considered a "macro".\n\n&aSafeMode is recommended if you want to be extra careful not to break the rules.',
		category: "Importing/Exporting",
		subcategory: "Importing/Exporting",
	})
	useSafeMode = false;

	@SliderProperty({
		name: "GUI Timeout",
		description: "Amount of ticks after not clicking anything in the GUI before declaring an error and timing out.\n\n&eIf you have lots of lagspikes / slow internet and BHTSL keeps timing out you should increase this.",
		category: "Importing/Exporting",
		subcategory: "Importing/Exporting",
		min: 60,
		max: 200
	})
	guiTimeout = 60;

	@SliderProperty({
		name: "GUI Delay",
		description: "Adds extra delay between clicks while importing. Not required, but it might help if imports freeze often. Measured in milliseconds",
		category: "Importing/Exporting",
		subcategory: "Importing/Exporting",
		min: 0,
		max: 1000
	})
	guiDelay = 0;
	
	// Import Menu

	@SwitchProperty({
		name: "Toggle File Explorer Window",
		description: "Turning this on will add a toggle button to show the file explorer instead of always being open",
		category: "Import Menu",
		subcategory: "Import Menu"
	})
	toggleFileExplorer = false;

	@SwitchProperty({
		name: "Alternate Icons",
		description: "Toggles between the different icons (default icons by Sandy, alternate icons by ixNoah)",
		category: "Import Menu",
		subcategory: "Import Menu"
	})
	altIcons = false;

	@SwitchProperty({
		name: "Items as Icons",
		description: "Instead of showing the json icon, it will show the item it represents",
		category: "Import Menu",
		subcategory: "Import Menu"
	})
	itemIcons = false;

	@SliderProperty({
		name: "GUI Debounce",
		description: "Adds a delay between when it allows you to next click, prevents accidentally clicking something (Milliseconds)",
		category: "Import Menu",
		subcategory: "Import Menu",
		min: 0,
		max: 50
	})
	debounce = 10;

	@SwitchProperty({
		name: "Refresh File Explorer Automatically",
		description: "Refresh the file explorer whenever the GUI is opened, without having to press the refresh button",
		category: "Import Menu",
		subcategory: "Import Menu"
	})
	refreshFileExplorerAutomatically = true;

	@SwitchProperty({
		name: "GUI Avaliable Everywhere",
		description: "Show the GUI whenever you are able to import items, not just scripts",
		category: "Import Menu",
		subcategory: "Import Menu"
	})
	guiAvaliableEverywhere = false;

	@SwitchProperty({
		name: "Render GUI Above Potion Effects",
		description: "Show the GUI ontop of potion effects in the player inventory. This can cause issues if you are using other mods that change the inventory screen",
		category: "Import Menu",
		subcategory: "Import Menu"
	})
	renderGUIAbovePotionEffects = false;

	@SwitchProperty({
		name: "Global Search",
		description: "Search all subdirectories at once instead of just the current directory",
		category: "Import Menu",
		subcategory: "Import Menu"
	})
	globalSearch = false;
	
	constructor() {
		this.initialize(this);
	}
}

export default new Settings();
