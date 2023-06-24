class Enchiridion extends FormApplication {

	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			id: "enchiridion",
			classes: ["enchiridion"],
			title: game.world.title + " Enchiridion",
			template: "modules/enchiridion/enchiridion-template.hbs",
			// width: game.settings.get("enchiridion", "windowWidth"),
			// height: 800,
			minimum: 500,
			scrollY: ['.enchiridion-body', '.enchiridion-nav', '.enchiridion-main', '.enchiridion-document'],
			maximum: null,
			minimizable: true,
			resizable: true,
			tabs: [{ navSelector: ".enchiridion-tabs", contentSelector: ".enchiridion-body", initial: game.settings.get('enchiridion', 'activeTab')}],
		});
	}

	async getData() {

		const actors = game.actors;
		const items = game.items;
		const journal = game.journal;
		const scenes = game.scenes;
		const folders = game.folders.filter((folder) => ["Actor","JournalEntry","Item", "Scene"].includes(folder.type));

		let compendiumIds = []
		let compendiumDocuments = []
		let settingCompendiums = [...new Set(game.settings.get('enchiridion', 'compendiums'))]

		settingCompendiums.forEach((id) =>{
			const pack = game.packs.get(id)
			if (pack.visible === false) return;

			const documents = pack.contents
			const folders = pack.folders.contents
			compendiumDocuments = compendiumDocuments.concat(...documents, ...folders)
			compendiumIds = compendiumIds.concat(pack.collection)
		})

		let documents = [...journal, ...actors, ...items, ...folders, ...scenes, ...compendiumDocuments]

		const compendiums = compendiumIds.map(id =>{
			const pack = game.packs.get(id)
			if (pack.size == 0) pack.getDocuments()

			const color = "rgba(150, 150, 150)";

			let ownershipIcon ='fa-lock';
			let ownershipName ='Hidden';

			switch (pack.ownership.PLAYER){
				case 'LIMITED':
					ownershipIcon = 'fa-low-vision';
					ownershipName = 'Limited';
					break;
				case 'OBSERVER':
					ownershipIcon = 'fa-eye';
					ownershipName = 'Observer';
					break;
				case 'OWNER':
					ownershipIcon = 'fa-feather-pointed';
					ownershipName = 'Owner';
					break;
			}

			return {
				isCompendium:true,
				compendiumId: pack.collection,
				compendiumName: pack.title,
				enchiridionIcon: '📦',
				enchiridionChildren: documents.filter(document => document.pack == pack.collection && !document.folder),
				enchiridionExpanded: game.settings.get("enchiridion", "userExpanded").includes(pack.collection)?"expanded":"",
				enchiridionOwnership: game.user.isGM?`<i data-tooltip="${ownershipName}" class="fas ${ownershipIcon}" style="color: ${color};"/></i>`:"",
			}
		})

		documents = documents.filter((document)=> (document.visible || document.displayed) && !document.flags.enchiridion?.hidden).sort((a, b) => a.sort - b.sort);

		const children = {}
		const references = {}
		const outgoingReferences = {}
		documents.forEach(document =>{
			const parent = document.pack?document.folder?.uuid:document.pack || document.flags.enchiridion?.parent || document.folder?.uuid;
			children[parent] = (children[parent] || []).concat(document);

			document.flags.enchiridion?.assets?.forEach((asset =>{
				const target = asset?.uuid
				references[target] = (references[target] || []).concat(document);
			}));

			document.flags.enchiridion?.assets?.forEach((asset =>{
				const newDocument = documents.find(document => document.uuid == asset?.uuid);
				if (newDocument) outgoingReferences[document.uuid] = (outgoingReferences[document.uuid] || []).concat(newDocument);
			}))
		});

		

		const activeTab = game.settings.get("enchiridion", "activeTab");
		const expanded = game.settings.get("enchiridion", "userExpanded");
		const userTabs = game.settings.get('enchiridion', 'userTabs');

		const roots = compendiums || [];
		const openTabs = [];

		await documents.map(async document => {
			document.enchiridionIcon = document.flags.enchiridion?.icon;
			if (!document.flags.enchiridion?.icon){
				let type = document.type || document.documentName;
				if (document.documentName == 'Folder') type = "Folder";
				document.enchiridionIcon = game.settings.get('enchiridion', 'default-'+type);
			}

			if (!document.flags.enchiridion?.parent && !document.folder && !document.pack) roots.push(document)
			if (userTabs.includes(document.uuid)) openTabs.push(document)

			const active = activeTab == document.uuid?"active":"";

			document.enchiridionExpanded = expanded.includes(document.uuid)?"expanded":"";
			document.enchiridionActive = active
			document.enchiridionChildren = children[document.uuid];

			document.enchiridionOwnership = '';
			if (game.user.isGM){
				for (let id in document.ownership) {
					const thisOwnership = document.ownership[id];
					if (id == 'default' || thisOwnership != 3 ){
						const user = game.users.get(id);
						const color = user?.color || "rgba(150, 150, 150)";
						const name = user?.name || 'Default';
		
						let ownershipIcon ='fa-lock';
						let ownershipName ='Hidden';
						switch (thisOwnership){
							case CONST.DOCUMENT_PERMISSION_LEVELS.LIMITED:
								ownershipIcon = 'fa-low-vision';
								ownershipName = 'Limited';
								break;
							case CONST.DOCUMENT_PERMISSION_LEVELS.OBSERVER:
								ownershipIcon = 'fa-eye';
								ownershipName = 'Observer';
								break;
							case CONST.DOCUMENT_PERMISSION_LEVELS.OWNER:
								ownershipIcon = 'fa-feather-pointed';
								ownershipName = 'Owner';
								break;
						}
		
						document.enchiridionOwnership = `<i data-tooltip="${name}: ${ownershipName}" class="fas ${ownershipIcon}" style="color: ${color};"/></i>` + document.enchiridionOwnership ;
					};
	
				}
				if (document.documentName == 'Folder') document.enchiridionOwnership = `<i data-tooltip="Folder" class="fas fa-folder-open" style="color: rgba(150, 150, 150);"/></i>`;
			}

			if(!userTabs.includes(document.uuid)) return;
			if (document.flags.enchiridion?.parent) document.enchiridionParent = documents.find(parent => parent.uuid == document.flags.enchiridion?.parent);
			document.enchiridionReferences = references[document.uuid];
			document.enchiridionOutgoingRefernces = outgoingReferences[document.uuid];

			const summaryKey = Enchiridion.detailKeys[game.system.id][document.type || document.documentName];
			document.enchiridionSummary = summaryKey?.split('.').reduce((p,c)=>p&&p[c]||null, document);

			if  (game.system.id== 'forgeoflegends' && document.documentName =="Item"){
				await document.generateSummary();
				let summary = $(document.system.summary)
				summary.find('.item-header').remove()
				document.enchiridionSummary = summary.html()
				document.disableSummary = true;
			}

			// const template = await renderTemplate(document.sheet.template, document);


			// document.enchiridionSheet = template;
			// document.enchiridionSheetListeners = document.sheet;










		});

		Enchiridion.documents = documents;

		return {
			documents,
			roots,
			openTabs,
			isGM: game.user.isGM,
		}
	};

	activateListeners(html) {
		// $('.enchiridion-branch:not(.expanded) .enchiridion-children').remove()

		const searchStr = game.settings.get('enchiridion','searchOptions').string

		$('.enchiridion-search').val(searchStr);
		if (this.options.searchStr) Enchiridion.filter();

		html.find('.enchiridion-open-tab').on("dblclick", Enchiridion.openDocument);
		html.find('.enchiridion-open-tab').on("singleclick", Enchiridion.openTab);
		html.find('.enchiridion-open-tab').on("mousedown", Enchiridion.middleExpand);
		html.find('.fa-plus').on("click", Enchiridion.createContents);
		html.find('.enchiridion-search-controls a').on("click", Enchiridion.toggleSearch);
		html.find('.enchiridion-search').on("input", Enchiridion.filter);
		html.find('.enchiridion-open-document').on("singleclick", Enchiridion.openDocument);
		html.find('.enchiridion-open-document').on("dblclick", Enchiridion.openDocument);
		html.find('.enchiridion-main-image').on("dblclick", Enchiridion.openDocument);
		html.find('.enchiridion-main-image').on("singleclick", Enchiridion.clickImage);
		html.find('.enchiridion-main-image').on("contextmenu", Enchiridion.clickImage);
		html.find('.tab-content').on("singleclick", Enchiridion.selectTab);
		html.find('.tab-content').on("dblclick", Enchiridion.selectTab);
		html.find('.tab-content').on("dblclick", Enchiridion.openDocument);
		html.find('.tab-content').on("mousedown", Enchiridion.middleCloseTab);
		html.find('.enchiridion-expand').on("click", Enchiridion.expand);
		html.find('.enchiridion-close-tab').on("click", Enchiridion.closeTab);
		html.find('.enchiridion-close-tab').on("mousedown", Enchiridion.middleCloseTab);
		html.find('.enchiridion-asset-activate').on("click", Enchiridion.assetActivate);
		html.find('.enchiridion-back-button').on("click", Enchiridion.goBack);
		if (game.user.isGM){
			html.find('.enchiridion-note-content').on("input", Enchiridion.editNote);
			html.find('.enchiridion-summary-input').on("input", Enchiridion.editSummary);
			html.find('.enchiridion-page-name-input').on("input", Enchiridion.editPageName);
			html.find('.enchiridion-page-input').on("input", Enchiridion.editPage);
			html.find('.enchiridion-new-page').on("click", Enchiridion.newPage);
			html.find('.enchiridion-delete-page').on("click", Enchiridion.deletePage);
			html.find('.enchiridion-icon-change a').each(Enchiridion.emojiButton);
			html.find('.enchiridion-icon-select').on("click", Enchiridion.select);
			html.find('.enchiridion-hide-note').on("click", Enchiridion.hideNote);
			html.find('.enchiridion-asset-name').on("input", Enchiridion.updateAssetName);
			html.find('.enchiridion-new-note').on("click", Enchiridion.newNote);
			html.find('.enchiridion-delete-note').on("click", Enchiridion.deleteNote);
			html.find(".enchiridion-ownership").on("click", Enchiridion.ownership);
			html.find(".enchiridion-pack-ownership").on("click", Enchiridion.packOwnership);
			html.find(".enchiridion-drop").on("drop", Enchiridion.onDrop);
		} else {
			html.find('.private-true').remove()
		};

		new ContextMenu(html, '.enchiridion-branch-title', Enchiridion.contextItems);

		new ContextMenu(html, '.enchiridion-asset', Enchiridion.assetContext);
		
		$( ".enchiridion-nav" ).resizable({
			handles: "e",
			resize: function( ev, ui ) {
				document.querySelector(':root').style.setProperty('--enchiridion-tree-width', ui.size.width+'px');
				game.settings.set('enchiridion', "treeWidth", ui.size.width+'px');
			}
		  });
		  document.querySelector(':root').style.setProperty('--enchiridion-tree-width', game.settings.get('enchiridion', "treeWidth"));
  
		  $( ".enchiridion-nav.ui-resizable" ).css({ width: game.settings.get('enchiridion', "treeWidth") });


		html.find('.enchiridion-search-controls a').each(function(){
			let searchOptions = game.settings.get('enchiridion','searchOptions');
			const toggle = $(this).data('toggle');
			if(!searchOptions[toggle]) $(this).addClass('inactive');
		})

		if (game.user.isGM){
			let handler = ev => Enchiridion.onDragItemStart(ev);
			html.find('.enchiridion-drag').each((i, li) => {
				li.setAttribute("draggable", true);
				li.addEventListener("dragstart", handler, false);
			});
		}

		if (game.system.id== 'forgeoflegends') ForgeOfLegends.registerTooltips(html)
		
		//MCE
		if (game.user.isGM) tinymce.init(Enchiridion.mceOptions);
		$('body').find('[style*="position: static; height: 0px; width: 0px; padding: 0px; margin: 0px; border: 0px;"]').remove()

		$('.enchidirion-page-image[data-type="pdf"]').each(function(){
			let src = this.getAttribute("src")
			const params = new URLSearchParams();
			if ( src ) {
				src = URL.parseSafe(src) ? src : foundry.utils.getRoute(src);
				params.append("file", src);
			}
			const frame = document.createElement("iframe");
			frame.src = `scripts/pdfjs/web/viewer.html?${params}`;
			const target = this;
			target.replaceWith(frame);
		})



	};

};



/* -------------------------------------------------------------------------- */
/*                               Functions		                              */
/* -------------------------------------------------------------------------- */

Enchiridion.update = function(maximize){
	if (!Enchiridion.instance?.element?.length) return;
	Enchiridion.instance.render(false);
};

Enchiridion.open = function(){
	Enchiridion.history = [];
	Enchiridion.instance = new Enchiridion().render(true);
	if (Enchiridion.instance.element[0]) Enchiridion.instance.bringToTop();
};

Enchiridion.updateDocument = function (document, updates, options, c, v){
	if (options.preventUpdate || document.actor || /*updates.sort ||*/ updates.flags?.enchiridion/*?.parent*/) return;
	Enchiridion.update();
}

Enchiridion.deleteDocument = function (document){
	const tabs = game.settings.get('enchiridion', 'userTabs').filter(t => t != document.uuid);
	game.settings.set('enchiridion', 'userTabs', tabs);
	Enchiridion.update();
}

Enchiridion.openFromSheet = async function (ev){
	const uuid = $(this).data("uuid");
	let tabs = game.settings.get('enchiridion', 'userTabs');
	tabs.indexOf(uuid) != -1 || tabs.push(uuid);
	game.settings.set('enchiridion', 'userTabs', tabs);
	Enchiridion.updateHistory();
	game.settings.set('enchiridion', 'activeTab', uuid);
	const document = await fromUuid(uuid);
	await Enchiridion.expandParents(document);
	Enchiridion.open();
}

Enchiridion.expandParents = async function (document){
	const uuid = document.flags.enchiridion?.parent;
	if (!uuid) return;
	const expanded = game.settings.get('enchiridion', 'userExpanded')
	expanded.push(uuid);
	game.settings.set('enchiridion', 'userExpanded', [...new Set(expanded)]);
	const parent = await fromUuid(uuid);
	return Enchiridion.expandParents(parent);
}

Enchiridion.openTab = function(ev, backUuid){
	if (ev?.shiftKey){
		$(ev.currentTarget).closest('[data-uuid]').toggleClass('enchiridion-multiselect');
	} else{
		let uuid = backUuid || $(ev?.currentTarget)?.closest('[data-uuid]').data('uuid');
		if (!backUuid) Enchiridion.updateHistory();
		if (uuid.includes("Folder")) return Enchiridion.expand(ev);
		game.settings.set('enchiridion', 'activeTab', uuid);
		let tabs = game.settings.get('enchiridion', 'userTabs');
		if (tabs.indexOf(uuid) == -1){
			tabs.push(uuid);
			game.settings.set('enchiridion', 'userTabs', tabs);
			Enchiridion.open();
		}else{
			$(`[data-uuid="${uuid}"] .tab-content`)[0].click()
		};
	}
};

Enchiridion.updateHistory = function(ev){
	Enchiridion.history = Enchiridion.history?.concat(game.settings.get('enchiridion', 'activeTab'))
};


Enchiridion.goBack = function(ev){
	if (Enchiridion.history.length){
		Enchiridion.openTab(ev, Enchiridion.history.pop());
		// if (!Enchiridion.history.length) $('.enchiridion-back-button').css('opacity', '0.5');
	};
};

Enchiridion.openDocument = async function (ev) {
	ev.preventDefault()
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	if (!document.visible) return;
	const sheet = document.sheet;
	if(ui.PDFoundry?.Utilities?.getPDFData(document)){
		const pdf = ui.PDFoundry.Utilities.getPDFData(document)
		ui.PDFoundry.openPDF(pdf)
	} else if ( sheet.rendered ) {
		sheet.maximize();
		sheet.bringToTop();
	} else sheet.render(true);
}

Enchiridion.selectTab = function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const activeTab = game.settings.get('enchiridion', 'activeTab')
	if (activeTab != uuid) Enchiridion.updateHistory();		
	game.settings.set('enchiridion', 'activeTab', uuid);
	$('.branch-active').removeClass('branch-active');
	$(`.enchiridion-branch[data-uuid="${uuid}"] > .enchiridion-branch-header`).addClass('branch-active');
	Enchiridion.update();
}

Enchiridion.closeTab = function  (ev) {
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const tabs = game.settings.get('enchiridion', 'userTabs').filter(t => t != uuid);
	game.settings.set('enchiridion', 'userTabs', tabs);
	Enchiridion.update();
}

Enchiridion.middleCloseTab = function (ev) {ev.button === 1 && Enchiridion.closeTab(ev);}

Enchiridion.expand = function (ev) {
	const uuid = $(ev.currentTarget).closest('.enchiridion-branch').data('uuid') || $(ev.currentTarget).closest('.enchiridion-branch').data('packId')
	let expanded = game.settings.get('enchiridion', 'userExpanded');
	expanded.indexOf(uuid) === -1? expanded.push(uuid) : expanded.splice(expanded.indexOf(uuid), 1)
	game.settings.set('enchiridion', 'userExpanded', [...new Set(expanded)]);
	Enchiridion.update();
}

Enchiridion.middleExpand = function (ev) {ev.button === 1 && Enchiridion.expand(ev);}

// Enchiridion.getIcon = function(document) {
// 	let type = document.type || document.documentName;
// 	if (document.documentName == 'Folder') type = "Folder";
// 	const defaultIcon =  game.settings.get('enchiridion', 'default-'+type);
// 	return document.flags.enchiridion?.icon||defaultIcon;
// }

Enchiridion.emojiButton = async function (i,icon){
	await EmojiButton(icon, async function (emoji) {
		const uuid = $(icon).closest('[data-uuid]').data('uuid');
		const document = await fromUuid(uuid);
		await document.setFlag('enchiridion', 'icon', emoji);
		Enchiridion.update()
	  });
}

Enchiridion.select = function(ev){$(ev.currentTarget).closest('[data-uuid]').toggleClass('enchiridion-multiselect')}

Enchiridion.clickImage = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	if (!document?.img) return;
	let ip = new ImagePopout(document.img, {
		title: document.name,
		shareable: true,
		uuid: document.uuid
	}).render(true);
	if($(ev.currentTarget).data('activation') == 2 && game.user.isGM) ip.shareImage();
}


Enchiridion.editSummary = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	const type = document.type || document.documentName;
	const text = this.innerHTML;
	let key = "enchiridionSummary";
		if (type != "undefined") {
			key = Enchiridion.detailKeys[game.system.id][type];
		}
		document.update({
			[key]: text
		},
		{
			preventUpdate: true
		})
}


Enchiridion.updateAssetName = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	const index =  $(ev.currentTarget).parents('.enchiridion-asset').index();
	const text = $(this).val();
	let assets = document.getFlag('enchiridion', 'assets');
	assets[index].name = text;
	document.update({
		flags: {enchiridion: {assets}}
	},
	{
		preventUpdate: true
	})
}


Enchiridion.editPage = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	const text = this.innerHTML;
	document.update({
		["text.content"]: text
	},
	{preventUpdate: true}
	)
}

Enchiridion.editPageName = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	const text = this.value;
	document.update({
		name: text
	},
	{preventUpdate: true}
	)
}

Enchiridion.newPage = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	await document.createEmbeddedDocuments("JournalEntryPage", [{
		type:"text",
		name: `New Page`,
	}])
	Enchiridion.update()
};




Enchiridion.deletePage = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	await document.deleteDialog();
	Enchiridion.update()
};


Enchiridion.mceOptions = {
	selector: '.enchiridion-note-content, .enchiridion-summary-input, .enchiridion-page-input',
	menubar: false,
	inline: true,
	plugins: [
		'autolink',
		'codesample',
		'link',
		'lists',
		'media',
		//'powerpaste',
		'table',
		'image',
		//'quickbars',
		'codesample',
		'help',
	],
	toolbar: false,
	//quickbars_insert_toolbar: 'quicktable image media codesample numlist bullist',
	quickbars_selection_toolbar: 'bold italic underline | styleselect | blockquote quicklink | fontselect fontsizeselect forecolor backcolor',
	contextmenu: 'undo redo | inserttable | cell row column deletetable | help',
	//powerpaste_word_import: 'clean',
}

Enchiridion.detailKeys = {
	dnd5e:{
		character: "system.details.biography.value",
		npc: "system.details.biography.value",
		vehicle: "system.details.biography.value",

		weapon:"system.description.value",
		equipment:"system.description.value",
		consumable:"system.description.value",
		tool:"system.description.value",
		loot:"system.description.value",
		class:"system.description.value",
		spell:"system.description.value",
		feat:"system.description.value",
		backpack:"system.description.value",
	},
	forgeoflegends: {
		character: "system.background",
		item: "system.description",
		skill: "system.description",
	}
}














Enchiridion.editNote = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	const index =  $(ev.currentTarget).parents('.enchiridion-note').index();
	let notes = document.getFlag('enchiridion', 'notes');
	const text = this.innerHTML;
	notes[index].content = text//TextEditor.enrichHTML(text);
	document.update({
		flags: {enchiridion: {notes}}
	},
	{preventUpdate: true}
	)
};

Enchiridion.newNote = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	let notes = document.getFlag('enchiridion', 'notes') || []
	const newNote = [
		{
			content:"",
			permissions:{}
		}
	];
	notes = [].concat(notes,newNote)
	await document.setFlag('enchiridion', 'notes', notes);
	Enchiridion.update();
};

Enchiridion.deleteNote = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	const index =  $(ev.currentTarget).parents('.enchiridion-note').index();
	let notes = document.getFlag('enchiridion', 'notes')
	notes.splice(index, 1);
	await document.setFlag('enchiridion', 'notes', notes);
	Enchiridion.update();
}

Enchiridion.hideNote = async function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	const index =  $(ev.currentTarget).parents('.enchiridion-note').index();
	let notes = document.getFlag('enchiridion', 'notes')
	notes[index].permissions={default:!notes[index].permissions.default}
	await document.setFlag('enchiridion', 'notes', notes);
	Enchiridion.update();
}

Enchiridion.toggleSearch = function (ev) {
	const toggle = $(ev.currentTarget).data('toggle');
	let searchOptions = game.settings.get('enchiridion','searchOptions');
	searchOptions[toggle] = !searchOptions[toggle];
	game.settings.set('enchiridion','searchOptions', searchOptions);
	$(ev.currentTarget).toggleClass('inactive');
	$(`.enchiridion-not-found`).removeClass('enchiridion-not-found');
	$(`.enchiridion-found`).removeClass('enchiridion-found');
	Enchiridion.filter();
}

Enchiridion.filter = function (){
	let searchOptions = game.settings.get('enchiridion','searchOptions');
	var searchStr = $('.enchiridion-search').val();
	searchOptions.string = searchStr;
	game.settings.set('enchiridion','searchOptions', searchOptions);
	searchStr = searchStr.toLowerCase();

	if (searchStr == ''){
		$(`.enchiridion-not-found`).removeClass('enchiridion-not-found');
		$(`.enchiridion-found`).removeClass('enchiridion-found');
		return;
	}
	
	$(`.enchiridion-nav .enchiridion-branch`).addClass('enchiridion-not-found').removeClass('enchiridion-found');

	const documents = Enchiridion.documents;
	for ( let [key, document] of Object.entries(documents) ) {
		if(
				document.name.toLowerCase().includes(searchStr) ||
				(searchOptions.notes && document.flags.enchiridion?.notes?.some(note => {
					return note?.content?.toLowerCase().includes(searchStr)
				})) ||
				(searchOptions.assets && document.flags.enchiridion?.assets?.some(asset => {
					return asset?.name?.toLowerCase().includes(searchStr)
				})) ||
				(searchOptions.items && document.items?.some(item => {
					return item?.name?.toLowerCase().includes(searchStr)
				}))||
				(searchOptions.summary && document.enchiridionSummary?.toLowerCase().includes(searchStr))
		){
			$(`.enchiridion-nav [data-uuid="${document.uuid}"]`).removeClass('enchiridion-not-found').addClass('enchiridion-found');
			$(`.enchiridion-nav [data-uuid="${document.uuid}"]`).parentsUntil( ".enchiridion-nav" ).removeClass('enchiridion-not-found').addClass('enchiridion-found');
		}
	}
}

Enchiridion.createContents = async function(ev){
	let uuid = null;
	let parentDescription ='';
	let comepndiumType = false;
	let compendium = null;

	if ($(ev).closest('.compendium').length){
		$('.enchiridion-multiselect').removeClass('enchiridion-multiselect')
		const id = ev.closest('.compendium').data('packId');
		compendium = game.packs.get(id);
		comepndiumType = compendium.documentName
		parentDescription = `${compendium.title} ➜ `;
		pack = compendium.collection;
	} else if (ev?.closest){
		uuid = ev.closest('[data-uuid]').data('uuid');
		const parent = await fromUuid(uuid);
		parentDescription = `${parent.name} ➜ `;
	};

	let documentTypes = ['Journal Entry', "Scene"].concat(game.system.documentTypes["Actor"]).concat(game.system.documentTypes["Item"]).filter(type => type !== "base")
	.concat(["Actor.Folder", "Item.Folder", "Scene.Folder", "JournalEntry.Folder"]);

	if (comepndiumType) documentTypes = game.system.documentTypes[comepndiumType].filter(type => type !== "base").concat(comepndiumType+'.Folder')

	new Dialog({
		title: `${parentDescription}Create New Document`,
		content: `<form autocomplete="off" onsubmit="event.preventDefault();">
					<div class="form-group">
						<div class="form-fields">
							<div class="enchiridion-icon" data-tooltip="Icon | Leave unchanged for default icon"><a>❓</a></div>
							<input class="enchiridion-create-name" type="text" name="name" placeholder="Name" autocomplete="off" data-tooltip="Name" autofocus>
							<select class="enchiridion-select" name="type" data-tooltip="Type">
								${documentTypes.reduce((string, type) => string+=`<option value="${type}" style = "text-transform:capitalize;">${type.replace('.',' ')}</option>`, "")}
							</select>
						</div>
					</div>
				</form>
	`,
		buttons: {
		 one: {
		  icon: '<i class="fas fa-check"></i>',
		  label: "Create",
		  callback: async function(html) {
				const form = html[0].querySelector("form");
				const name = $(form).find('[name="name"]').val()
				const newSubType = $(form).find('[name="type"]').val()
				const folder = uuid?.split('.')[0]=='Folder'?uuid?.split('.')[1]:null;
				let icon = $(form).find('.enchiridion-icon')[0].innerText

				if (icon =='❓') icon = null;
				let newData = {
					name,
					folder,
					flags: {
						enchiridion:{
							parent: uuid,
							icon
						}}
				}
				let newId ='';
				let newDocuemnt = null
				if (newSubType == 'Journal Entry'){
					newDocuemnt = await JournalEntry.create(newData);
				} else if (game.system.documentTypes["Actor"].includes(newSubType)){
					newData.type = newSubType;
					newDocuemnt = await Actor.create(newData);
				} else if (game.system.documentTypes["Item"].includes(newSubType)){
					newData.type = newSubType;
					if (compendium){
						newDocuemnt = compendium.createDocument(newData)
					} else{
						newDocuemnt = await Item.create(newData);
					}
				} else if (newSubType == 'Scene'){
					newData.type = newSubType;
					newDocuemnt = await Scene.create(newData);
				} else if (newSubType.split('.')[1] == 'Folder') {
					newData.type = newSubType.split('.')[0];
					newDocuemnt = await Folder.create(newData)
				}
				
				if (newSubType.split('.')[1] != 'Folder') newId = newDocuemnt.uuid;
				if (uuid) Enchiridion.setParent(newDocuemnt, uuid);
				if (newSubType.split('.')[1] != 'Folder') newDocuemnt.sheet.render(true)



				let expanded = game.settings.get('enchiridion', 'userExpanded')
				expanded.push(uuid)
				game.settings.set('enchiridion', 'userExpanded', [...new Set(expanded)])

				let tabs = game.settings.get('enchiridion', 'userTabs')
				tabs.push(newId)
				game.settings.set('enchiridion', 'userTabs', tabs)
				Enchiridion.updateHistory();
				game.settings.set('enchiridion', 'activeTab', newId)
				if (Enchiridion.instance?.element?.length) Enchiridion.open();
			},
		 },
		 two: {
		  icon: '<i class="fas fa-times"></i>',
		  label: "Cancel",
		 }
		},
		default: "one",
		render: html => {
			html.find('.enchiridion-icon').each(function(i,icon){
				EmojiButton(icon, function (emoji) {
					icon.innerText = emoji;
				});
			})
		},
		close: html => $('.enchiridion-multiselect').removeClass('enchiridion-multiselect'),
	   }).render(true);
};


Enchiridion.ownership = function (ev){
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = CONFIG[uuid.split(".")[0]].collection.instance.get(uuid.split(".")[1]);
	new EnchiridionOwnershipConfig(document).render(true);
}

Enchiridion.packOwnership = async function (ev){
	const id = $(ev.currentTarget).closest('.compendium').data('packId');
	const compendium = game.packs.get(id);
	await compendium.configureOwnershipDialog();
	Enchiridion.update();
}

class EnchiridionOwnershipConfig extends DocumentSheet {

	/** @override */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
		id: "permission",
		template: "templates/apps/ownership.html",
		width: 400
		});
	}
	
	/* -------------------------------------------- */
	
	/** @override */
	get title() {
		return `${game.i18n.localize("OWNERSHIP.Title")}: ${this.document.name}`;
	}
	
	/* -------------------------------------------- */
	
	/** @override */
	getData(options) {
		const isFolder = this.document instanceof Folder;
		const ownership = this.document.ownership;
		if ( !ownership && !isFolder ) {
		throw new Error(`The ${this.document.documentName} document does not contain ownership data`);
		}
	
		// User permission levels
		const playerLevels = [];
		if ( isFolder ) {
		playerLevels.push({level: -2, label: game.i18n.localize("OWNERSHIP.DEFAULT")});
		playerLevels.push({level: -1, label: game.i18n.localize("OWNERSHIP.NOCHANGE")});
		} else {
		playerLevels.push({level: -1, label: game.i18n.localize("OWNERSHIP.DEFAULT")});
		}
		for ( let [name, level] of Object.entries(CONST.DOCUMENT_OWNERSHIP_LEVELS) ) {
		playerLevels.push({level, label: game.i18n.localize(`OWNERSHIP.${name}`)});
		}
	
		// Default permission levels
		const defaultLevels = foundry.utils.deepClone(playerLevels);
		defaultLevels.shift();
	
		// Player users
		const users = game.users.map(user => {
		return {user, level: isFolder ? -1 : ownership[user.id]};
		});
	
		// Construct and return the data object
		return {
		currentDefault: ownership?.default ?? "-1",
		instructions: game.i18n.localize(isFolder ? "OWNERSHIP.HintFolder" : "OWNERSHIP.HintDocument"),
		defaultLevels,
		playerLevels,
		isFolder,
		users
		};
	}
	
	/* -------------------------------------------- */
	
	/** @override */
	async _updateObject(ev, formData) {
		ev.preventDefault();
		if ( !game.user.isGM ) throw new Error("You do not have the ability to configure permissions.");
	
		// Collect new ownership levels from the form data
		const ownershipLevels = {};
		for ( let [user, level] of Object.entries(formData) ) {
		if ( level === -1 ) {
			delete ownershipLevels[user];
			continue;
		}
		ownershipLevels[user] = level;
		}
	
		// Update all documents in a Folder
		if ( this.document instanceof Folder ) {
		const cls = getDocumentClass(this.document.type);
		const updates = this.document.content.map(d => {
			const ownership = foundry.utils.deepClone(d.ownership);
			for ( let [k, v] of Object.entries(ownershipLevels) ) {
			if ( v === -2 ) delete ownership[k];
			else ownership[k] = v;
			}
			return {_id: d.id, ownership};
		});

		//Enchiridion Adjustments
		const enchiridionChildren = Enchiridion.documents.filter((document)=>document.flags?.enchiridion?.parent == this.document.uuid);
		const uniqueChildren = enchiridionChildren.filter(x => !this.document.content.includes(x));
		for (const document of uniqueChildren) {
			await document.update({ownership: ownershipLevels}, {preventUpdate: true})
		}
		if(!this.document.content.length) Enchiridion.update()

		return cls.updateDocuments(updates, {diff: false, recursive: false, noHook: true});
		}
	
		// Update a single Document
		return this.document.update({ownership: ownershipLevels}, {diff: false, recursive: false, noHook: true});
	}
}

Enchiridion.contextItems = [
	{
		name: "Edit",
		icon: '<i class="fas fa-edit"></i>',
		condition: li => !li.parent().parent().hasClass('compendium'),
		callback: async li => {
			$('.enchiridion-multiselect').removeClass('enchiridion-multiselect');
			const uuid = li.closest('[data-uuid]').data('uuid')
			const document = await fromUuid(uuid);
			return document.sheet.render(true);
		}
	},
	{
		name: "Activate Scene",
		icon: '<i class="fas fa-map"></i>',
		condition: li => game.user.isGM && li.closest('[data-uuid]').data('uuid')?.includes("Scene") && !li.closest('.compendium').length,
		callback: async li => {
			$('.enchiridion-multiselect').removeClass('enchiridion-multiselect');
			const uuid = li.closest('[data-uuid]').data('uuid')
			const document = await fromUuid(uuid);
			return document.activate();
		}
	},
	{
		name: "Create Contents",
		icon: '<i class="fas fa-plus"></i>',
		condition: li => game.user.isGM  && !li.closest('.compendium').length,
		callback: li => {
			$('.enchiridion-multiselect').removeClass('enchiridion-multiselect');
			li.addClass('enchiridion-multiselect');
			Enchiridion.createContents(li);
		}
	},
	{
		name: "Remove from Container",
		icon: '<i class="fas fa-unlink"></i>',
		condition: li => game.user.isGM && li.parent().parent().parent().hasClass('enchiridion-children') && !li.parent().parent().hasClass('compendium') && !li.parent().parent().parent().parent('.enchiridion-document.compendium').length,
		callback: async li => {
			const uuid = li.closest('[data-uuid]').data('uuid')
			const multiUuid = $('.enchiridion-multiselect')?.closest('[data-uuid]')?.map(function(){
				return $(this).data('uuid');
			}).get();
			if (multiUuid.indexOf(uuid) == -1) multiUuid.push(uuid);
			for (const uuid of multiUuid){
				const document = await fromUuid(uuid);
				await document.update({
						flags: {
							enchiridion: {
								parent: null
							}
						},
						folder: null
					},
					{preventUpdate: true}
				)
			}
			return Enchiridion.update()
		}
	},
	{
		name: "Remove Compendium",
		icon: '<i class="fas fa-unlink"></i>',
		condition: li => game.user.isGM && li.parent().parent().hasClass('compendium'),
		callback: async li => {
			const packId = li.closest('.enchiridion-branch').data('packId')
			let packs = game.settings.get('enchiridion', 'compendiums');
			packs.splice(packs.indexOf(packId), 1);
			game.settings.set('enchiridion', 'compendiums', [...new Set(packs)]);
			Enchiridion.update();
		}
	},
	{
		name: "View Image",
		icon: '<i class="fas fa-image"></i>',
		condition: li => !li.is('[data-uuid*="Folder"]') && !li.parent().parent().hasClass('compendium'),
		callback: async li => {
			const uuid = li.closest('[data-uuid]').data('uuid');
			const multiUuid = $('.enchiridion-multiselect')?.closest('[data-uuid]')?.map(function(){
				return $(this).data('uuid');
			}).get();
			if (multiUuid.indexOf(uuid) == -1) multiUuid.push(uuid);
			for (const uuid of multiUuid){
				let image = null;
				const document = await fromUuid(uuid);
				if (document.documentName == "JournalEntry"){
					image = document.pages.contents.find(page => page.type == "image")?.src
				} else {
					image = document.img;
				}
				if (!image) return;
				new ImagePopout(image, {
					title: document.name,
					shareable: true,
					uuid: document.uuid
				}).render(true);
			};
			$('.enchiridion-multiselect').removeClass('enchiridion-multiselect');
		}
	},
	{
		name: "SIDEBAR.Delete",
		icon: '<i class="fas fa-trash"></i>',
		condition: li => game.user.isGM && !li.parent().parent().hasClass('compendium'),
		callback: async li => {
			const uuid = li.closest('[data-uuid]').data('uuid');
			const multiUuid = $('.enchiridion-multiselect')?.closest('[data-uuid]')?.map(function(){
				return $(this).data('uuid');
			}).get();
			if (multiUuid.indexOf(uuid) == -1) multiUuid.push(uuid);
			for (const uuid of multiUuid){
				const document = await fromUuid(uuid);
				const childrenUuids = $(`.enchiridion-branch[data-uuid="${document.uuid}"]`).children('.enchiridion-children').children().map(function(){
					return $(this).data('uuid');
				}).get()
			
				for (const childUuid of childrenUuids) {
					const child = await fromUuid(childUuid);
					await child.update({
						flags: {
							enchiridion: {
								parent: null
							}
						},
						folder: null
					},
					{preventUpdate: true}
					)
				}
				await document.deleteDialog();
			};
			
			return Enchiridion.update()

		}
	},
	{
		name: "PERMISSION.Configure",
		icon: '<i class="fas fa-lock"></i>',
		condition: li => game.user.isGM && !li.closest('.compendium').length,
		callback: async li => {
			$('.enchiridion-multiselect').removeClass('enchiridion-multiselect');
			const uuid = li.closest('[data-uuid]').data('uuid');
			const multiUuid = $('.enchiridion-multiselect')?.closest('[data-uuid]')?.map(function(){
				return $(this).data('uuid');
			}).get();
			if (multiUuid.indexOf(uuid) == -1) multiUuid.push(uuid);
			for (const uuid of multiUuid){
				const document = await fromUuid(uuid);
				new EnchiridionOwnershipConfig(document).render(true);
			}
		}
	},
	// {
	// 	name: "Delete all Contents",
	// 	icon: '<i class="fas fa-dumpster"></i>',
	// 	condition: li => game.user.isGM && li.parent().is('[data-uuid*="Folder"]'),
	// 	callback: async li => {
	// 		const uuid = li.closest('[data-uuid]').data('uuid')
	// 		const document = CONFIG[uuid.split(".")[0]].collection.instance.get(uuid.split(".")[1])
	// 		return Dialog.confirm({
	// 			title: `${game.i18n.localize("FOLDER.Delete")} ${document.name}`,
	// 			content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("FOLDER.DeleteWarning")}</p>`,
	// 			yes: () => {
	// 				console.log(li.closest('.enchiridion-document .enchiridion-children'))
	// 				//document.delete({deleteSubfolders: true, deleteContents: true})
	// 			}
	// 		});
	// 	}
	// },
	{
		name: "Select all Contents",
		icon: '<i class="fas fa-file-check"></i>',
		condition: li => game.user.isGM && li.children('.enchiridion-children').children().length,
		callback: li => {
			li.closest('.enchiridion-branch').children(".enchiridion-children").show()
			li.closest('.enchiridion-branch').children(".enchiridion-children").children().addClass('enchiridion-multiselect');
		}
	},
	{
		name: "SIDEBAR.Duplicate",
		icon: '<i class="far fa-copy"></i>',
		condition: li => game.user.isGM && !li.is('[data-uuid*="Folder"]') && !li.closest('.compendium').length,
		callback: async li => {
			$('.enchiridion-multiselect').removeClass('enchiridion-multiselect');
			const uuid = li.closest('[data-uuid]').data('uuid')
			const document = await fromUuid(uuid);
			return document.clone({name: `${document?.name} (Copy)`}, {save: true});
		}
	},
	{
		name: "SIDEBAR.Export",
		icon: '<i class="fas fa-file-export"></i>',
		condition: li => game.user.isGM && !li.is('[data-uuid*="Folder"]') && !li.closest('.compendium').length,
		callback: async li => {
			const uuid = li.closest('[data-uuid]').data('uuid');
			const multiUuid = $('.enchiridion-multiselect')?.closest('[data-uuid]')?.map(function(){
				return $(this).data('uuid');
			}).get();
			if (multiUuid.indexOf(uuid) == -1) multiUuid.push(uuid);
			for (const uuid of multiUuid){
				const document = await fromUuid(uuid);
				document.exportToJSON();
			}
		}
	},
	{
		name: "SIDEBAR.Import",
		icon: '<i class="fas fa-file-import"></i>',
		condition: li => game.user.isGM && !li.is('[data-uuid*="Folder"]') && !li.closest('.compendium').length,
		callback: async li => {
			const uuid = li.closest('[data-uuid]').data('uuid');
			const multiUuid = $('.enchiridion-multiselect')?.closest('[data-uuid]')?.map(function(){
				return $(this).data('uuid');
			}).get();
			if (multiUuid.indexOf(uuid) == -1) multiUuid.push(uuid);
			for (const uuid of multiUuid){
				const document = await fromUuid(uuid);
				document.importFromJSONDialog();
			}
		}
	},
	// {
	// 	name: "FOLDER.Export",
	// 	icon: `<i class="fas fa-atlas"></i>`,
	// 	condition: li => game.user.isGM && li.parent().is('[data-uuid*="Folder"]'),
	// 	callback: async li => {
	// 		const uuid = li.closest('[data-uuid]').data('uuid')
	// 		const document = CONFIG[uuid.split(".")[0]].collection.instance.get(uuid.split(".")[1])
	// 		return document.exportDialog(null, {
	// 			top: Math.min(li[0].offsetTop, window.innerHeight - 350),
	// 			left: window.innerWidth - 720,
	// 			width: 400
	// 		});
	// 	}
	// },
	{
		name: "FOLDER.CreateTable",
		icon: `<i class="fas fa-th-list"></i>`,
		condition: li => game.user.isGM && li.children('.enchiridion-children').children().length && !li.closest('.compendium').length,
		callback: async li => {
			$('.enchiridion-multiselect').removeClass('enchiridion-multiselect');
			const uuid = li.closest('[data-uuid]').data('uuid')
			const document = await fromUuid(uuid);
			return Dialog.confirm({
				title: `${game.i18n.localize("FOLDER.CreateTable")}: ${document.name}`,
				content: game.i18n.localize("FOLDER.CreateTableConfirm"),
				yes: async () => {
					const uuids = li.children(".enchiridion-children").children().map(function(){
						return $(this).data('uuid');
					}).get()

					
					
					let contents =[]
					await uuids.forEach(async function (uuid){
						if (uuid.includes('Folder')) return;
						const c= await fromUuid(uuid);
						contents.push(c)
					});	
					const results = contents.map((e, i) => {
						return {
							text: e.name,
							type: CONST.TABLE_RESULT_TYPES.DOCUMENT,
							collection: e.documentName,
							resultId: e.id,
							img: e.thumbnail || e.img,
							weight: 1,
							range: [i+1, i+1],
							drawn: false
						};
						});
						const table = await RollTable.create({
						name: document.name,
						description: `A random table created from the contents of the ${document.name} ${document.documentName}.`,
						results: results,
						formula: `1d${results.length}`
						});

						return table.sheet?.render(true)
				},
				options: {
					top: Math.min(li.offsetTop, window.innerHeight - 350),
					left: window.innerWidth - 680,
					width: 360
				}
			});
		}
	}
];

Enchiridion.assetContext = [
	{
		name: "Remove",
		icon: '<i class="fas fa-times"></i>',
		condition: li => game.user.isGM,
		callback: async li => {
			const uuid = $(li).closest('.enchiridion-document[data-uuid]').data('uuid');
			const document = await fromUuid(uuid);
			let assets = document.getFlag('enchiridion', 'assets');
			const index =   $(li).closest('.enchiridion-asset').index();
				assets.splice(index, 1);
				document.setFlag('enchiridion', 'assets', assets);
				Enchiridion.update();
		}
	},
]
























/* -------------------------------------------------------------------------- */
/*                                Drag and Drop                               */
/* -------------------------------------------------------------------------- */

Enchiridion.onDragItemStart = async function (ev){
	$(ev.currentTarget).closest('.enchiridion-branch-header').addClass('enchiridion-multiselect')
	let uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	let document = await fromUuid(uuid);


	const assets = document?.getFlag('enchiridion', 'assets') || [];
	const assetIndex =  $(ev.currentTarget).parents('.enchiridion-asset').index();
	const asset = assets[assetIndex];

	if (asset?.uuid) uuid = asset?.uuid;

	const src = $(ev.currentTarget).attr('src');
	let type = asset?.type || document?.documentName;
	if (asset?.type == 'image' || asset?.type == 'video') type= "Tile";
	
	if ($(ev.currentTarget).hasClass('enchiridion-main-image')) document = null;
	if ($(ev.currentTarget).hasClass('enchiridion-main-image')) uuid = null;

	ev.dataTransfer.setData("text/plain", JSON.stringify({
		uuid,
		type,
		img: asset?.img || src,
		texture: {src},
		tileSize: 100,
		document,
		asset,
		assetIndex
		}));
};

Enchiridion.onDrop = async function(ev){
	if (!game.user.isGM) return;
	ev.stopPropagation();
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	const dropType = $(ev.currentTarget).closest('.enchiridion-drop').data('dropType');
	let assets = document.flags.enchiridion?.assets || [];

	let dataTransfer;
	try {dataTransfer = JSON.parse(ev.originalEvent.dataTransfer.getData('text/plain'));}
	catch (err) {};
	const files = ev.originalEvent.dataTransfer.files;

	if(!dataTransfer && !files) return;

	if (dataTransfer.type == 'Compendium'){
		let packs = game.settings.get('enchiridion', 'compendiums');
		packs.push(dataTransfer.id);
		game.settings.set('enchiridion', 'compendiums', [...new Set(packs)]);
		return Enchiridion.update()
	}

	/* Upload External File*/
	if(files.length){
		$('.enchiridion-multiselect').removeClass('enchiridion-multiselect')
		for (const [index, file] of Object.values(files).entries()){
		// Object.values(files).forEach(async function(file, index){
			let type = file.type.split('/')[0];
			const extention = file.type.split('/')[1]
			if (!type || (type == 'application' && extention != 'pdf')) return ui.notifications.warn("That file type is not supported.")


			let url

			switch (type){
				case "application": {
					url =  `worlds/${game.world.id}/pdfs`;
				} break;
				case "audio": {
					url =  `worlds/${game.world.id}/audios`;
				} break;
				case "image": {
					url =  `worlds/${game.world.id}/images/${document.collectionName}`;
				} break;
				case "video": {
					url =  `worlds/${game.world.id}/videos/${document.collectionName}`;
				} break;
			}



			await FilePicker.upload("data", url, file, {});

			let id = `${url}/${file.name}`;
			let image = "modules/enchiridion/icons/book-open-solid.png";
			if (type == 'image' || type == 'video') image = id;
			if (type == 'audio') image = 'modules/enchiridion/icons/music-solid.png';
			if (extention == 'pdf') image = 'modules/enchiridion/icons/file-pdf-regular.png';

			const fileData = {
				id,
				type,
				name: file.name,
				image,
				uuid: null,
			}

			if (dropType == "asset" || dropType == "swap" || dropType == "branch"){
				await Enchiridion.createAsset(document, fileData);
			} else if (dropType == "mainImage"){
				if (index == 0 && image == id){
					await Enchiridion.createAsset(document, {
						id: document.img,
						uuid: null,
						type: 'image',
						name: document.name + " Previous Image",
						image: document.img,
					}, true)
					await document.update({
						[`img`]: image,
					});
				} else {
					await Enchiridion.createAsset(document, fileData);
				}
			}
		}//)
		return Enchiridion.update();
	};

	const sourceAsset = dataTransfer?.asset;
	const destinationIndex = $(ev.currentTarget).closest('.enchiridion-asset').index();
	const sourceIndex = dataTransfer?.assetIndex;
	const sourceUuid = dataTransfer?.uuid;
	
	let h = $(ev.currentTarget).innerHeight();
	let o = $(ev.currentTarget).offset(); 
	let y = ev.pageY - o.top;
	let sortBefore = false
	if(h/2 > y) sortBefore = true;

	const multiUuid = $('.enchiridion-multiselect')?.closest('[data-uuid]')?.map(function(){
		return $(this).data('uuid');
	}).get();
	if (multiUuid.indexOf(sourceUuid) == -1 && sourceUuid) multiUuid.push(sourceUuid);

	let update = false;

	for (const sourceUuid of multiUuid){
		const sourceDocument = await fromUuid(sourceUuid);
		if (!sourceDocument && !sourceAsset) return;

		let image = "modules/enchiridion/icons/book-open-solid.png";
		if (sourceDocument?.documentName == 'Scene') image = 'modules/enchiridion/icons/map-solid.png';
		if (sourceDocument?.documentName == 'Playlist') image = 'modules/enchiridion/icons/th-list-solid.png';
		if (sourceDocument?.documentName == 'PlaylistSound') image = 'modules/enchiridion/icons/music-solid.png';
		if (sourceDocument?.documentName == 'Folder') image = 'modules/enchiridion/icons/folder-open-solid.png';
		if (sourceDocument?.img) image = sourceDocument?.img;

		if (dropType == "tab"){
			Enchiridion.updateHistory();
			game.settings.set('enchiridion', 'activeTab', uuid);
			if (sourceAsset){
				await Enchiridion.createAsset(document, sourceAsset)
			} else {
				await Enchiridion.createAsset(document, {
					id: sourceDocument.uuid,
					uuid: sourceDocument.uuid,
					type: sourceDocument.documentName,
					name: sourceDocument.name,
					image,
				});
				update = true;
			}
		} else if (dropType == "asset"){
			if (sourceAsset){
				await Enchiridion.createAsset(document, sourceAsset)
			} else {
				await Enchiridion.createAsset(document, {
					id: sourceDocument.uuid,
					uuid: sourceDocument.uuid,
					type: sourceDocument.documentName,
					name: sourceDocument.name,
					image,
				});
				update = true;
			}
		} else if (dropType == "swap"){
			if(assets[sourceIndex]){
				assets[sourceIndex] = [assets[destinationIndex],assets[destinationIndex]=assets[sourceIndex]][0];
				document.setFlag('enchiridion', 'assets', assets);
				Enchiridion.update();
			} else {
				await Enchiridion.createAsset(document, {
					id: sourceDocument.uuid,
					uuid: sourceDocument.uuid,
					type: sourceDocument.documentName,
					name: sourceDocument.name,
					image,
				});
				update = true;
			}
		} else if (dropType == "mainImage"){
			if (sourceAsset){
				await Enchiridion.createAsset(document, {
					id: sourceDocument.img,
					uuid: null,
					type: 'image',
					name: sourceDocument.name + " Previous Image",
					image: sourceDocument.img,
				},true)
				await document.update({
					[`img`]: sourceAsset.image,
				});
			};
			$('.enchiridion-multiselect').removeClass('enchiridion-multiselect')
		} else if (dropType =="branch"){
			if (sourceDocument.uuid ==  document.uuid) return $('.enchiridion-multiselect').removeClass('enchiridion-multiselect');

			async function checkLoops(targetDocument){
				let parentUuids = [];
				async function pushParent(child){
					parentUuids.push(child.uuid);
					let parentUuid = child.flags.enchiridion?.parent;
					if (parentUuid){
						const parent = await fromUuid(parentUuid);
						await pushParent(parent);
					};
				};

				await pushParent(targetDocument);
				
				if(parentUuids.includes(sourceUuid)){
					ui.notifications.warn("That arrangement would create a loop! Please choose a different arrangement.");
					$('.enchiridion-multiselect').removeClass('enchiridion-multiselect')
					return true
				};
			};

			if (await checkLoops(document)) return;
				
			if(ev.shiftKey){
				
				const parentUuid = document.flags.enchiridion?.parent;
				if (parentUuid) {
					const parent = await fromUuid(parentUuid);
					if (await checkLoops(parent)) return;
					await Enchiridion.setParent(sourceDocument, parentUuid)
				}
				

				let documents = Enchiridion.documents;

				const sorting = SortingHelpers.performIntegerSort(sourceDocument, {target:document, siblings:documents, sortKey:'sort', sortBefore});
				const itemSort = sorting.filter(d => d.target.documentName == "Item");
				const actorSort = sorting.filter(d => d.target.documentName == "Actor");
				const journalSort = sorting.filter(d => d.target.documentName == "JournalEntry");
				const folderSort = sorting.filter(d => d.target.documentName == "Folder");
				const sceneSort = sorting.filter(d => d.target.documentName == "Scene");

				async function updateSort(sorter, constructor){
					const updates = [];
					let updateData={};
					for ( let s of sorter ) {
						const doc = s.target;
						const update = foundry.utils.mergeObject(updateData, s.update, {inplace: false});
						update._id = doc.id;
						updates.push(update);
					}
					if ( updates.length ) await constructor.updateDocuments(updates, {preventUpdate: true});
				}

				await updateSort(itemSort, Item)
				await updateSort(actorSort, Actor)
				await updateSort(journalSort, JournalEntry)
				await updateSort(folderSort, Folder)
				await updateSort(sceneSort, Scene)
			} else {
				await Enchiridion.setParent(sourceDocument, document.uuid)
			}
			update = true;
		}
	};
	if (update) Enchiridion.update();


};



















Enchiridion.setParent = async function(child, parent){

	
	const parentDocument = await fromUuid(parent);

	if (parentDocument?.pack != child.pack) return;

	if (parent) {
		let expanded = game.settings.get('enchiridion', 'userExpanded')
		expanded.push(parent);
		game.settings.set('enchiridion', 'userExpanded', [...new Set(expanded)]);
	}

	let updates = {
		flags: {
			enchiridion: {
				parent: parent
			}
		},
		folder:null,
		parent:null,
	}

	

	if (parent.includes("Folder")){
		if (parentDocument.type == child.documentName || (parentDocument.type == child.type && parentDocument.depth < 3)){
			updates.folder = parent.split('.')[ parent.split('.').length - 1],
			updates.parent = parent.split('.')[ parent.split('.').length - 1];
		}
	} else {
		let type = child.documentName != "Folder"?child.documentName:child.type
		let folder = game.folders.getName("Enchiridion-"+type)
		if (!folder && child.documentName != "Folder") folder = await Folder.create({
			name: "Enchiridion-"+child.documentName,
			type,
			flags: {enchiridion:{hidden:true}}
		})
		updates.folder = folder?.uuid?.split('.')[1];
		updates.parent = folder?.uuid?.split('.')[1];
	}
	await child.update(updates, {preventUpdate: true});
}
























Enchiridion.createAsset = async function(document, data, preventUpdate=false){

	if (document.uuid == data.uuid) return;

	let assets = document.flags.enchiridion?.assets || [];
	let icon1 = "fa-cog"
	let name1 = "Edit"
	let icon2 = null
	let name2 = null

	if (data.type == 'video' || data.type == 'image'){
		icon1 = "fa-image";
		name1 = "View";
		icon2 = "fa-share";
		name2 = "Share";
	} else if (data.type == 'Playlist' || data.type == 'PlaylistSound' || data.type == 'audio'){
		icon1 = "fa-play-pause";
		name1 = "Play/Pause";
		icon2 = "fa-cog";
		name2 = "Edit";
	} else if (data.type == 'RollTable'){
		icon1 = "fa-dice";
		name1 = "Roll on Table";
		icon2 = "fa-cog";
		name2 = "Edit";
	} else if (data.type == 'Scene'){
		icon1 = "fa-map";
		name1 = "Activate Scene";
		icon2 = "fa-cog";
		name2 = "Edit";
	} else if (data.type == 'application'){
		icon1 = "fa-file-pdf";
		name1 = "View PDF";
	} else if (data.type == 'Actor' || data.type == 'Item' || data.type == 'JournalEntry'){
		icon1 = "fa-cog";
		name1 = "Edit";
		icon2 = "fa-book-medical";
		name2 = "Enchiridion";
	}

	const newAsset = {
		uuid:data.uuid,
		id:data.id,
		name:data.name,
		image:data.image,
		type:data.type,
		permissions:{default:false},
		icon1,
		name1,
		icon2,
		name2,
	}

	if(!assets.find(asset => asset.id==data.id)){
		assets = [].concat(assets,[newAsset])
		await document.update({
			flags: {
				enchiridion: {
					assets
				}
			},
		}, {preventUpdate})
	}

}





















/* -------------------------------------------------------------------------- */
/*                               Activate Assets                              */
/* -------------------------------------------------------------------------- */
Enchiridion.assetActivate = async (ev) => {
	const uuid = $(ev.currentTarget).closest('[data-uuid]').data('uuid');
	const document = await fromUuid(uuid);
	let assets = document.getFlag('enchiridion', 'assets');
	let activation = $(ev.currentTarget).data("activation");
	const index =   $(ev.currentTarget).closest('.enchiridion-asset').index();

	if (activation == 4 && game.user.isGM){
		assets.splice(index, 1);
		await document.setFlag('enchiridion', 'assets', assets);
		return Enchiridion.update();
	};

	if (activation == 3 && game.user.isGM){
		assets[index].permissions={default:!assets[index].permissions.default}
		await document.setFlag('enchiridion', 'assets', assets);
		return Enchiridion.update();
	};

	const asset = document.flags?.enchiridion?.assets[index];
	if (!asset) return;
	const assetUuid = asset.uuid
	let assetDocument;
	if (assetUuid) assetDocument = await fromUuid(assetUuid);
	const assetTitle = asset.name
	const extention = asset.id?.split('.')[1];
	const assetType = asset.type;
	let src, ip;

	
	if (activation == 0){
		src = $(ev.currentTarget).attr('src');
		ip = new ImagePopout(src, {
			title: assetTitle,
			shareable: true,
			uuid: document.uuid
		})
		
		return ip.render(true);
	};


	switch (assetType){
		case 'image':
			src = ev.currentTarget.src || $(ev.currentTarget).closest('.enchiridion-asset').find('img').attr('src');
			ip = new ImagePopout(src, {
				title: assetTitle,
				shareable: true,
				uuid: document.uuid
			})
			ip.render(true);
			if(activation == 2 && game.user.isGM) ip.shareImage();
		break;
		case 'video':
			src = ev.currentTarget.src || $(ev.currentTarget).closest('.enchiridion-asset').find('img').attr('src');
			ip = new ImagePopout(src, {
				title: assetTitle,
				shareable: true,
				uuid: document.uuid
			})
			ip.render(true);
			if(activation == 2 && game.user.isGM) ip.shareImage();
		break;
		case "Scene" :
			if (!game.user.isGM) return;
			if(activation == 1){
				assetDocument.activate();
			} else if (activation == 2){
				if (assetDocument.sheet.rendered) {
					assetDocument.sheet.maximize();
					assetDocument.sheet.bringToTop();
				} else assetDocument.sheet.render(true);
			}
		break;
		case "RollTable" :
			if(activation == 1){
				assetDocument.draw()
			} else {
				if (!assetDocument.visible) return;
				if (assetDocument.sheet.rendered) {
					assetDocument.sheet.maximize();
					assetDocument.sheet.bringToTop();
				} else assetDocument.sheet.render(true);
			}
		break;
		case "application" :
			if (extention == 'pdf'){
				new FrameViewer(asset.id, {
					title:assetTitle,
					resizable: true,
				  }).render(true);
			}
		break;
		case "Actor" :
			if (assetDocument){
				if(activation == 2){
						let tabs = game.settings.get('enchiridion', 'userTabs');
						tabs.push(assetUuid);
						game.settings.set('enchiridion', 'userTabs', tabs);
						Enchiridion.updateHistory();
						game.settings.set('enchiridion', 'activeTab', assetUuid);
						Enchiridion.update();
				} else {
					if (!assetDocument.visible) return;
					if (assetDocument.sheet.rendered) {
						assetDocument.sheet.maximize();
						assetDocument.sheet.bringToTop();
					} else assetDocument.sheet.render(true);
				}				
			} else {
				ui.notifications.warn("That Document Could not be Found")
			}
		break;
		case "Item" :
			if (assetDocument){
				if(activation == 2){
						let tabs = game.settings.get('enchiridion', 'userTabs');
						tabs.push(assetUuid);
						game.settings.set('enchiridion', 'userTabs', tabs);
						Enchiridion.updateHistory();
						game.settings.set('enchiridion', 'activeTab', assetUuid);
						Enchiridion.update();
				} else {
					if (!assetDocument.visible) return;
					if (assetDocument.sheet.rendered) {
						assetDocument.sheet.maximize();
						assetDocument.sheet.bringToTop();
					} else assetDocument.sheet.render(true);
				}				
			} else {
				ui.notifications.warn("That Document Could not be Found")
			}
		break;
		case 'audio':
			if (!game.user.isGM) return;
			const playlist = await game.playlists.getName("~Enchiridion") || await Playlist.create({name: "~Enchiridion", mode:-1}, {temporary:false});
			const sound = await playlist.sounds.find(sound => sound.path == asset.id) || await playlist.createEmbeddedDocuments('PlaylistSound', [{
				name: asset.name, 
				path:asset.id,
				repeat: false,
			}]);

			if(activation == 1){
				if (sound.playing){
					sound.update({playing: false, pausedTime: sound.sound.currentTime});
				} else {
					playlist.playSound([].concat(sound)[0])
				}
			} else {
				if (!sound.visible) return;
				if (sound.sheet.rendered) {
					sound.sheet.maximize();
					sound.sheet.bringToTop();
				} else sound.sheet.render(true);
			}	
		break;
		case "PlaylistSound" :
			if (!game.user.isGM) return;
			if(activation == 1){
				if(assetDocument.playing){
					assetDocument.update({playing: false, pausedTime: assetDocument.sound.currentTime});
				} else {
					assetDocument.parent.playSound(assetDocument)
				}

			} else if (activation == 2){
				if (!assetDocument.visible) return;
				if (assetDocument.sheet.rendered) {
					assetDocument.sheet.maximize();
					assetDocument.sheet.bringToTop();
				} else assetDocument.sheet.render(true);
			}
		break;
		case "Playlist" :
			if (!game.user.isGM) return;
			if(activation == 1){
				if(assetDocument.playing){
					assetDocument.stopAll()
				} else {
					assetDocument.playAll()
				}

			} else if (activation == 2){
				if (!assetDocument.visible) return;
				if (assetDocument.sheet.rendered) {
					assetDocument.sheet.maximize();
					assetDocument.sheet.bringToTop();
				} else assetDocument.sheet.render(true);
			}
		break;
		case "JournalEntry" :
			if (assetDocument){
				if(activation == 2){
				let tabs = game.settings.get('enchiridion', 'userTabs');
				tabs.push(assetUuid);
				game.settings.set('enchiridion', 'userTabs', tabs);
				Enchiridion.updateHistory();
				game.settings.set('enchiridion', 'activeTab', assetUuid);
				Enchiridion.update();
			}
			else if(activation == 1 && ui.PDFoundry?.Utilities?.getPDFData(assetDocument)){
				const pdf = ui.PDFoundry.Utilities.getPDFData(assetDocument);
				ui.PDFoundry.openPDF(pdf);
			} else {
				if (!assetDocument.visible) return;
				if (assetDocument.sheet.rendered) {
					assetDocument.sheet.maximize();
					assetDocument.sheet.bringToTop();
				} else assetDocument.sheet.render(true);
			}
			} else {
				ui.notifications.warn("That Document Could not be Found")
			}
		break;
		default:
			if (assetDocument){
				if (!assetDocument.visible) return;
				if (assetDocument.sheet.rendered) {
					assetDocument.sheet.maximize();
					assetDocument.sheet.bringToTop();
				} else assetDocument.sheet.render(true);
			} else {
				ui.notifications.warn("That Document Could not be Found")
			}
	};
};














Hooks.on("renderImagePopout", function(document,html){

    //Adjust Appearance
    html.find('.window-resizable-handle').remove()
    html.find('.window-header').remove()
    html.find('.window-content').css("background-color", "transparent");
    html.css("background", "none");
    html.css("box-shadow", "none");
    html.css("max-height", "none");
    html.find('form').css("overflow", "hidden");
    html.find('figure').css("margin", "0rem");
    html.find('.lightbox-image').css("flex", "1");
    html.closest(".window-content").css("overflow-y", "unset")

    //Click to Drag
    html.mousedown(function(e){
        window.my_dragging = {};
        my_dragging.pageX0 = e.pageX;
        my_dragging.pageY0 = e.pageY;
        my_dragging.elem = this;
        my_dragging.offset0 = $(this).offset();
        function handle_dragging(e){
            var left = my_dragging.offset0.left + (e.pageX - my_dragging.pageX0);
            var top = my_dragging.offset0.top + (e.pageY - my_dragging.pageY0);
            $(my_dragging.elem)
            .offset({top: top, left: left});
        }
        function handle_mouseup(e){
            $('body')
            .off('mousemove', handle_dragging)
            .off('mouseup', handle_mouseup);
        }
        $('body')
        .on('mouseup', handle_mouseup)
        .on('mousemove', handle_dragging);
    });

    //Mousewheel to Zoom
    html.on('mousewheel', function(event){
		const sign = Math.sign(event.originalEvent.deltaY) >= 0;
		html.width(sign?html.width()*.95:html.width()/.95)
		html.height(sign?html.height()*.95:html.height()/.95)
		html.css('top', html.position().top + (sign?html.height()*.025:html.height()*-.025));
		html.css('left', html.position().left + (sign?html.width()*.025:html.width()*-.025));
    });

    //Double Click to Close
    var DELAY = 250, clicks = 0, timer = null;
    html.on('click', function(ev){
        clicks++;
        if(clicks === 1) {
            timer = setTimeout(function() {
                clicks = 0;
            }, DELAY);

        } else {
            clicks = 0;
            clearTimeout(timer);
            document.close()
        }
    })

    //Right Click for Options
    let X,Y,parentOffset;
    html.on('contextmenu', function(e) {
        parentOffset = $(this).offset(); 
        X = e.pageX - parentOffset.left;
        Y = e.pageY - parentOffset.top;
    })

    html.on('DOMNodeInserted', function(e) {
        $(e.target).css("left", X+'px')
        $(e.target).css("top", Y+'px')
        html.css("position", "fixed");
    });

    const menuItems = [
        {
            name: "JOURNAL.ActionShow",
            icon: '<i class="fas fa-eye"></i>',
            callback: () => document.shareImage()
        },
        {
            name: "Close",
            icon: '<i class="fas fa-times"></i>',
            callback: () => document.close()
        },
        {
            name: "Send to Back",
            icon: '<i class="fas fa-level-down-alt"></i>',
            callback: () => html.css('z-index', 100)
        }
    ]

    new ContextMenu(html, '.image-popout', menuItems);



})





















/* -------------------------------------------------------------------------- */
/*                                  Settings                                  */
/* -------------------------------------------------------------------------- */
Hooks.once("ready", async function() {

	loadTemplates(["modules/enchiridion/templates/enchiridion-branch.hbs"]);

	game.settings.register("enchiridion", "activeTab", {
		name: "activeTab",
		hint: "",
		scope: "client",
		config: false,
		default: "",
		type: String
	});

	game.settings.register("enchiridion", "userTabs", {
		name: "userTabs",
		hint: "",
		scope: "client",
		config: false,
		default: [],
		type: Array
	});

	game.settings.register("enchiridion", "userExpanded", {
		name: "userExpanded",
		hint: "",
		scope: "client",
		config: false,
		default: [],
		type: Array
	});

	game.settings.register("enchiridion", "compendiums", {
		name: "compendiums",
		hint: "",
		scope: "world",
		config: false,
		default: [],
		type: Array
	});

	game.settings.register("enchiridion", "searchOptions", {
		name: "searchOptions",
		hint: "",
		scope: "client",
		config: false,
		default: {
			string: "",
			names: false,
			references: false,
			notes: false,
			assets: false,
			items: false,
			case: false,
			summary: false,
		},
		type: Object
	});

	game.settings.register("enchiridion", "open", {
		name: "Open at Starup",
		hint: "Open Enchiridion as soon as the game initializes.",
		scope: "client",
		config: true,
		default: false,
		type: Boolean
	});

	game.settings.register("enchiridion", "treeWidth", {
		name: "treeWidth",
		hint: "",
		scope: "client",
		config: false,
		default: "300px",
		type: String
	});

	const documentTypes = ['JournalEntry', 'Folder', 'Playlist', 'Scene'].concat(game.system.documentTypes["Actor"]).concat(game.system.documentTypes["Item"]);

	const defaults = {
		character: '🧑',
		npc: '👤',
		vehicle: '⛵',
		item: '♟️',
		skill: '⚡',
		effect: '🏅',
		weapon: '🗡️',
		equipment: '🛡️',
		consumable: '🧪',
		tool: '🛠️',
		loot: '💰',
		class: '🧙',
		spell: '🔥',
		feat: '⚡',
		backpack: '🎒',
		Folder: '📂',
		Playlist: '🎵',
		Scene: '🗺️',
		Deck: '🃏',
		base: '📖'
	}

	documentTypes.forEach(function(type){
		game.settings.register("enchiridion", "default-"+type, {
			name: "Default " + type.charAt(0).toUpperCase() + type.slice(1) +" Icon",
			hint: "",
			scope: "world",
			config: game.user.isGM,
			default: defaults[type] || '📖',
			type: String
		});
	})

	if (game.user.isGM) await createFoldersIfMissing();
	async function createFolderIfMissing(folderPath) {
		let source = "data";
		if (typeof ForgeVTT != "undefined" && ForgeVTT.usingTheForge) {
			source = "forgevtt";
		}
		try {
			await FilePicker.browse(source, folderPath);
		} catch (error){
			await FilePicker.createDirectory(source, folderPath);
		}
	}
	


	async function createFoldersIfMissing() {
		await createFolderIfMissing(`worlds/${game.world.id}/pdfs`);
		await createFolderIfMissing(`worlds/${game.world.id}/audio`);
		await createFolderIfMissing(`worlds/${game.world.id}/images`);
		await createFolderIfMissing(`worlds/${game.world.id}/images/actors`);
		await createFolderIfMissing(`worlds/${game.world.id}/images/items`);
		await createFolderIfMissing(`worlds/${game.world.id}/images/journal`);
		await createFolderIfMissing(`worlds/${game.world.id}/images/scenes`);
		await createFolderIfMissing(`worlds/${game.world.id}/videos`);
		await createFolderIfMissing(`worlds/${game.world.id}/videos/actors`);
		await createFolderIfMissing(`worlds/${game.world.id}/videos/items`);
		await createFolderIfMissing(`worlds/${game.world.id}/videos/journals`);
		await createFolderIfMissing(`worlds/${game.world.id}/videos/scenes`);
	}

	if (game.settings.get("enchiridion", "open")) Enchiridion.open();
});

Hooks.on("renderSceneControls", (document, html) => {
	$('.main-controls').append(
		`<li class="scene-control openEnchiridion" data-tooltip="Enchiridion"><i class="fas fa-book-medical" ></i></li>`
	);
	$('.openEnchiridion').on('click', Enchiridion.open)
	$('.openEnchiridion').on('contextmenu', () => Enchiridion.createContents())
})

Hooks.on("renderPlaylistDirectory", (document, html) => {

	html.find(".playlist").on("drop", ev => {
		if (!game.user.isGM) return;
		let dataTransfer;
		try {dataTransfer = JSON.parse(ev.originalEvent.dataTransfer.getData('text/plain'));}
		catch (err) {};
		if (dataTransfer?.asset?.type =='audio'){
			const path = dataTransfer.asset.id;
			const name = dataTransfer.asset.name;
			const id = $(ev.currentTarget).data("documentId");
			const playlist = game.playlists.get(id)
			let data= [{
				name, 
				path,
				repeat:true
			}]
			playlist.createEmbeddedDocuments('PlaylistSound', data)
		}
	});

	
	$('.playlist-name:contains("~Enchiridion")').parent().parent().remove()

});
 

// Hooks.on("renderSidebarTab", (document, html) => {
// 	let itemFolder = game.folders.getName("Enchiridion-Item").id
// 	html.find(`[data-folder-id="${itemFolder}"]`).remove()
	
// 	let actorFolder = game.folders.getName("Enchiridion-Actor").id
// 	html.find(`[data-folder-id="${actorFolder}"]`).remove()
	
// 	let journalFolder = game.folders.getName("Enchiridion-JournalEntry").id
// 	html.find(`[data-folder-id="${journalFolder}"]`).remove()
// })

Hooks.on("createItem", Enchiridion.updateDocument)
Hooks.on("updateItem", Enchiridion.updateDocument)
Hooks.on("deleteItem", Enchiridion.deleteDocument)
Hooks.on("createActor", Enchiridion.updateDocument)
Hooks.on("updateActor", Enchiridion.updateDocument)
Hooks.on("deleteActor", Enchiridion.deleteDocument)
Hooks.on("createJournalEntry", Enchiridion.updateDocument)
Hooks.on("updateJournalEntry", Enchiridion.updateDocument)
Hooks.on("deleteJournalEntry", Enchiridion.deleteDocument)
Hooks.on("deleteFolder", Enchiridion.deleteDocument)
Hooks.on("updateFolder", Enchiridion.updateDocument)
Hooks.on("createFolder", Enchiridion.updateDocument)
 
Hooks.on("getEnchiridionHeaderButtons", function(app,buttons){
	const open = game.settings.get("enchiridion", "open");
	buttons.unshift({
		class: "startOpen",
		icon: open?"fa-solid fa-thumbtack":"fa-regular fa-thumbtack",
		label: "Open at Startup",
		onclick: () => {
			game.settings.set("enchiridion", "open", !open);
			$("#enchiridion .startOpen i").toggleClass("fa-solid").toggleClass("fa-regular");
		}
	});
})

Hooks.on("renderActorSheet", function(sheet,html){
	if (sheet.document.isToken) return;
	html.find('.window-header h4').after(`<a class="open-enchiridion" data-uuid="${sheet.document.uuid}"><i class="fas fa-book-medical"></i>Enchiridion</a>`);
	html.find('.open-enchiridion').on("singleclick", Enchiridion.openFromSheet);
	html.find("a.entity-link").on("contextmenu", Enchiridion.openTab);
})

Hooks.on("renderItemSheet", function(sheet,html){
	if (sheet.actor) return;
	html.find('.window-header h4').after(`<a class="open-enchiridion" data-uuid="${sheet.document.uuid}"><i class="fas fa-book-medical"></i>Enchiridion</a>`);
	html.find('.open-enchiridion').on("singleclick", Enchiridion.openFromSheet);

	// html.find('.tabs').append(`<a class="item" data-tab="${document.document.uuid}">Enchiridion</a>`)
	// html.find('.tabs .item').css('margin',0)
	// const enchiridion = await renderTemplate(`modules/enchiridion/templates/enchiridion-body.html`, document);
	// console.log(enchiridion, document)
	// html.find('.sheet-body').append(`<div id="enchiridion">${enchiridion}</div>`)
	
})

Hooks.on("renderJournalSheet", function(sheet,html){
	html.find('.window-header h4').after(`<a class="open-enchiridion" data-uuid="${sheet.document.uuid}"><i class="fas fa-book-medical"></i>Enchiridion</a>`);
	html.find('.open-enchiridion').on("singleclick", Enchiridion.openFromSheet);

	// const enchiridion = await renderTemplate(`modules/enchiridion/templates/enchiridion-body.html`, document);
	// html.find('input').append(`<div id="enchiridion">${enchiridion}</div>`)
})

Hooks.on("dropCanvasData", async function(canvas, dropData){
	$('.enchiridion-multiselect').removeClass('enchiridion-multiselect');
	if (dropData?.asset?.type =='audio'){
		canvas.sounds.activate();
		AmbientSoundDocument.create({
			t: "l",
			path: dropData.asset.id,
			radius: 3,
			easing: true,
			repeat: true,
			volume: 1.0,
			x: dropData.x,
			y: dropData.y
		}, 
		{parent: canvas.scene});
	} else if (dropData?.asset?.type =='image'){
		const tex = await loadTexture(dropData.asset.id);
		const width = tex.baseTexture.width;
		const height = tex.baseTexture.height;

		canvas.tiles.activate();
		TileDocument.create({
			texture: {src:dropData.asset.id},
			x: dropData.x - (width / 2),
			y: dropData.y - (height / 2),
			width,
			height
		}, 
		{parent: canvas.scene})


	}

})









Hooks.once('ready', async function() {

	document.getElementById("board").addEventListener("drop", async (event) => {
		const files = event.dataTransfer.files;
		const coords = canvas.canvasCoordinatesFromClient(event);
		let dataTransfer;
		try {dataTransfer = JSON.parse(event.dataTransfer.getData('text/plain'));}
		catch (err) {};
		if (!files?.length || dataTransfer?.uuid) return;
		for (const file of files) {
			let type = file.type.split('/')[0];
			// const extention = file.type.split('/')[1]
			let url

	
			switch (type){
				case "image": {
					url =  `worlds/${game.world.id}/images/scenes`;
				} break;
				case "video": {
					url =  `worlds/${game.world.id}/videos/scenes`;
				} break;
				case "audio": {
					url =  `worlds/${game.world.id}/audio`;
				} break;
			}
		
			if (type == 'image' || type == 'video'){	
				await FilePicker.upload("data", url, file, {});

				const tex = await loadTexture(`${url}/${file.name}`);
				const width = tex.baseTexture.width;
				const height = tex.baseTexture.height;

				canvas.tiles.activate();
				TileDocument.create({
					texture: {src:`${url}/${file.name}`},
					x: coords.x - (width / 2),
					y: coords.y - (height / 2),
					width,
					height
				}, 
				{parent: canvas.scene}
				);
		
			} else if (type == 'audio'){
				await FilePicker.upload("data", url, file, {});

				canvas.sounds.activate();
				AmbientSoundDocument.create({
					t: "l",
					path: `${url}/${file.name}`,
					radius: 3,
					easing: true,
					repeat: true,
					volume: 1.0,
					x: coords.x,
					y: coords.y,
				}, 
				{parent: canvas.scene});
			}
		}
	  });
});


//Shift Scroll Scales Tiles

TilesLayer.prototype._onMouseWheel = function(event) {
    // Prevent wheel rotation for non-GM users if the game is paused
    if ( game.paused && !game.user.isGM ) return;

    // Determine the incremental angle of rotation from event data
    // const dBig = canvas.grid.isHex ? 60 : 45;
    // let snap = event.shiftKey ? dBig : 15;
	let snap = 15;
    let delta = snap * Math.sign(event.delta);

    // Case 1 - rotate preview objects
    if ( this.preview.children.length ) {
      for ( let p of this.preview.children ) {
        p.document.rotation = p._updateRotation({delta, snap});
        p.refresh();
      }
    }

    // Case 2 - Update multiple objects
    else if(event.ctrlKey || event.metaKey) return this.rotateMany({delta, snap});
	else if(event.shiftKey){
    	// Determine the set of scalable objects
		const scalable = this.controlled.filter(o => {
			return !o.document.locked;
		});
		if ( !scalable.length ) return [];

		// Conceal any active HUD
		const hud = this.hud;
		if ( hud ) hud.clear();

		let scale = Math.sign(event.delta) == -1? 10/9 : 9/10;

		// Update the objects with a single operation
		const updateData = scalable.map(o => {
		return {_id: o.id, height: (o.height-15)*scale, width: (o.width-15)*scale}
		});
		canvas.scene.updateEmbeddedDocuments(this.constructor.documentName, updateData);
	}
}



