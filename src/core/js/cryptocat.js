if (typeof Cryptocat === 'undefined') { Cryptocat = function() {} }

/*
-------------------
GLOBAL VARIABLES
-------------------
*/

Cryptocat.version = '2.1.21' // Version number

Cryptocat.me = {
	conversation: null,
	nickname: null,
	newMessages: 0,
	windowFocus: true,
	typing: false,
	otrKey: null,
	fileKey: null,
	mpPrivateKey: null,
	mpPublicKey: null,
	mpFingerprint: null,
	currentBuddy: {
		name: null,
		id: null
	}
}

Cryptocat.buddies = {
	'main-Conversation': {
		id: 'main-Conversation'
	}
}

Cryptocat.audioExt = '.mp3'
if (navigator.userAgent.match('OPR')) {
	Cryptocat.audioExt = '.ogg' // Opera doesn't support mp3 HTML5 audio
}
Cryptocat.sounds = {
	'keygenStart': (new Audio('snd/keygenStart' + Cryptocat.audioExt)),
	'keygenLoop':  (new Audio('snd/keygenLoop'  + Cryptocat.audioExt)),
	'keygenEnd':   (new Audio('snd/keygenEnd'   + Cryptocat.audioExt)),
	'userLeave':   (new Audio('snd/userLeave'   + Cryptocat.audioExt)),
	'userJoin':    (new Audio('snd/userJoin'    + Cryptocat.audioExt)),
	'msgGet':      (new Audio('snd/msgGet'      + Cryptocat.audioExt)),
	'balloon':     (new Audio('snd/balloon'     + Cryptocat.audioExt))
}

/*
-------------------
END GLOBAL SCOPE
-------------------
*/

if (typeof(window) !== 'undefined') { $(window).ready(function() {
'use strict';

/*
-------------------
INTIALIZATION
-------------------
*/

// Set version number in UI.
$('#version').text(Cryptocat.version)

// Seed RNG.
Cryptocat.random.setSeed(Cryptocat.random.generateSeed())

var conversationBuffers = {}

// Load favicon notification settings.
Tinycon.setOptions({
	colour: '#FFFFFF',
	background: '#76BDE5'
})

/*
-------------------
GLOBAL INTERFACE FUNCTIONS
-------------------
*/

// Update a file transfer progress bar.
Cryptocat.updateFileProgressBar = function(file, chunk, size, recipient) {
	var progress = (chunk * 100) / (Math.ceil(size / Cryptocat.otr.chunkSize))
	if (progress > 100) { progress = 100 }
	$('[file=' + file + '] .fileProgressBarFill').animate({'width': progress + '%'})
	var conversationBuffer = $(conversationBuffers[Cryptocat.buddies[recipient].id])
	conversationBuffer.find('[file=' + file + '] .fileProgressBarFill').width(progress + '%')
	conversationBuffers[Cryptocat.buddies[recipient].id] = $('<div>').append($(conversationBuffer).clone()).html()
}

// Convert Data blob/url to downloadable file, replacing the progress bar.
Cryptocat.addFile = function(url, file, conversation, filename) {
	var conversationBuffer = $(conversationBuffers[Cryptocat.buddies[conversation].id])
	var fileLinkString = 'fileLink'
	if (navigator.userAgent === 'Chrome (Mac app)') {
		fileLinkString += 'Mac'
	}
	var fileLink = Mustache.render(Cryptocat.templates[fileLinkString], {
		url: url,
		filename: filename,
		downloadFile: Cryptocat.locale['chatWindow']['downloadFile']
	})
	$('[file=' + file + ']').replaceWith(fileLink)
	conversationBuffer.find('[file=' + file + ']').replaceWith(fileLink)
	conversationBuffers[conversation] = $('<div>').append($(conversationBuffer).clone()).html()
}

// Signal a file transfer error in the UI.
Cryptocat.fileTransferError = function(sid) {
	$('[file=' + sid + ']').animate({
		'borderColor': '#F00'
	})
	$('[file=' + sid + ']').find('.fileProgressBarFill').animate({
		'background-color': '#F00'
	})
}

// Add a `message` from `nickname` to the `conversation` display and log.
// `type` can be 'file', 'composing', 'message', 'warning' or 'missingRecipients'.
// In case `type` === 'missingRecipients', `message` becomes array of missing recipients.
Cryptocat.addToConversation = function(message, nickname, conversation, type) {
	var lineDecoration = 2
	if (nickname === Cryptocat.me.nickname) {
		lineDecoration = 1
	}
	else if (Cryptocat.buddies[nickname].ignored) {
		return false
	}
	initializeConversationBuffer(Cryptocat.buddies[conversation].id)
	if (type === 'file') {
		if (!message.length) { return false }
		if (nickname !== Cryptocat.me.nickname) {
			if (Cryptocat.audioNotifications) { Cryptocat.sounds.msgGet.play() }
			desktopNotification(
				'img/keygen.gif', nickname + ' @ ' + Cryptocat.me.conversation, message, 0x1337
			)
		}
		message = Mustache.render(Cryptocat.templates.file, { message: message })
	}
	else if (type === 'composing') {
		if ($('#composing-' + Cryptocat.buddies[nickname].id).length) { return true }
		message = Mustache.render(
			Cryptocat.templates.composing, {
				id: 'composing-' + Cryptocat.buddies[nickname].id
			}
		)
	}
	else if (type === 'message') {
		if (!message.length) { return false }
		if (nickname !== Cryptocat.me.nickname) {
			if (Cryptocat.audioNotifications) { Cryptocat.sounds.msgGet.play() }
			desktopNotification(
				'img/keygen.gif', nickname + ' @ ' + Cryptocat.me.conversation, message, 0x1337
			)
		}
		message = Strophe.xmlescape(message)
		message = addLinks(message)
		message = addEmoticons(message)
		if (message.match(Cryptocat.me.nickname)) { lineDecoration = 3 }
	}
	else if (type === 'warning') {
		if (!message.length) { return false }
		if (nickname !== Cryptocat.me.nickname) {
			if (Cryptocat.audioNotifications) { Cryptocat.sounds.msgGet.play() }
			desktopNotification(
				'img/keygen.gif', nickname + ' @ ' + Cryptocat.me.conversation, message, 0x1337
			)
		}
		message = Strophe.xmlescape(message)
		lineDecoration = 4
	}
	else if (type === 'missingRecipients') {
		if (!message.length) { return false }
		message = message.join(', ')
		message = Mustache.render(Cryptocat.templates.missingRecipients, {
			text: 'Warning: this message could not be sent to ' + message // Replace with localization string!
		})
		conversationBuffers[Cryptocat.buddies[conversation].id] += message
		if (conversation === Cryptocat.me.currentBuddy.name) {
			$('#conversationWindow').append(message)
			$('.missingRecipients').last().animate({'top': '0', 'opacity': '1'}, 100)
			scrollDownConversation(400, true)
		}
		return true
	}
	var authStatus = false
	if ((nickname === Cryptocat.me.nickname)
	|| Cryptocat.buddies[nickname].authenticated) {
		authStatus = true
	}
	message = message.replace(/:/g, '&#58;')
	var renderedMessage = Mustache.render(Cryptocat.templates.message, {
		lineDecoration: lineDecoration,
		nickname: shortenString(nickname, 16),
		currentTime: currentTime(true),
		authStatus: authStatus,
		message: message
	})
	if (type !== 'composing') {
		conversationBuffers[Cryptocat.buddies[conversation].id] += renderedMessage
	}
	if (conversation === Cryptocat.me.currentBuddy.name) {
		if (
			(nickname === Cryptocat.me.nickname) ||
			!$('#composing-' + Cryptocat.buddies[nickname].id).length
		) {
			$('#conversationWindow').append(renderedMessage)
			$('.line' + lineDecoration).last().animate({'top': '0', 'opacity': '1'}, 100)
			bindSenderElement($('.line' + lineDecoration).last().find('.sender'))
		}
		else {
			var composingElement = $('#composing-' + Cryptocat.buddies[nickname].id)
			if (composingElement.length) {
				composingElement.replaceWith(message)
			}
		}
		scrollDownConversation(400, true)
	}
	else if (type !== 'composing') {
		$('#buddy-' + Cryptocat.buddies[conversation].id).addClass('newMessage')
	}
}

// Show a preview for a received message from a buddy.
// Message previews will not overlap and are removed after 5 seconds.
Cryptocat.messagePreview = function(message, nickname) {
	var buddyElement = $('#buddy-' + Cryptocat.buddies[nickname].id)
	if (!buddyElement.attr('data-utip')) {
		if (message.length > 15) {
			message = message.substring(0, 15) + '..'
		}
		buddyElement.attr({
			'data-utip-gravity': 'sw',
			'data-utip': Strophe.xmlescape(message)
		}).mouseenter()
		window.setTimeout(function() {
			buddyElement.mouseleave()
			buddyElement.removeAttr('data-utip')
		}, 0x1337)
	}
}

// Handles login failures.
Cryptocat.loginFail = function(message) {
	$('#loginInfo').text(message)
	$('#bubble').animate({'left': '+=5px'}, 130)
		.animate({'left': '-=10px'}, 130)
		.animate({'left': '+=5px'}, 130)
	$('#loginInfo').animate({'background-color': '#E93028'}, 200)
}

// Buddy constructor
var Buddy = function(nickname) {
	this.id = getUniqueBuddyID()
	this.ignored = false
	this.fingerprint = null
	this.authenticated = false
	this.fileKey = null
	this.mpPublicKey = null
	this.mpFingerprint = null
	this.mpSecretKey = null
	this.nickname = nickname
	this.genFingerState = null
	this.otr = Cryptocat.otr.add(nickname)
}

Buddy.prototype = {
	constructor: Buddy,
	updateAuth: function(auth) {
		this.authenticated = auth;
		if (auth) {
			$('#authenticated').attr('data-active', true)
			$('#notAuthenticated').attr('data-active', false)
			$('[data-sender=' + this.nickname + '] .authStatus').attr('data-auth', 'true')
		}
		else {
			$('#authenticated').attr('data-active', false)
			$('#notAuthenticated').attr('data-active', true)
			$('[data-sender=' + this.nickname + '] .authStatus').attr('data-auth', 'false')
		}
		var authStatusBuffers = ['main-Conversation', Cryptocat.buddies[this.nickname].id]
		for (var i in authStatusBuffers) {
			if (conversationBuffers[authStatusBuffers[i]]) {
				var conversationBuffer = $(conversationBuffers[authStatusBuffers[i]])
				conversationBuffer.find('[data-sender=' + this.nickname + '] .authStatus')
					.attr('data-auth', auth)
				conversationBuffers[authStatusBuffers[i]] = $('<div>').append($(conversationBuffer)
					.clone()).html()
			}
		}
	}
}

// Build new buddy.
Cryptocat.addBuddy = function(nickname) {
	var buddy = Cryptocat.buddies[nickname] = new Buddy(nickname)
	$('#buddyList').queue(function() {
		var buddyTemplate = Mustache.render(Cryptocat.templates.buddy, {
			buddyID: buddy.id,
			nickname: nickname,
			shortNickname: shortenString(nickname, 12)
		})
		$(buddyTemplate).insertAfter('#buddiesOnline').slideDown(100, function() {
			$('#buddy-' + buddy.id)
				.unbind('click')
				.click(function() {
					Cryptocat.onBuddyClick($(this))
				}
			)
			$('#menu-' + buddy.id).attr('status', 'inactive')
				.unbind('click')
				.click(function(e) {
					e.stopPropagation()
					openBuddyMenu(nickname)
				}
			)
			for (var u = 0; u < 4000; u += 2000) {
				window.setTimeout(Cryptocat.xmpp.sendPublicKey, u, nickname)
			}
			buddyNotification(nickname, true)
		})
	})
	$('#buddyList').dequeue()
}

// Handle buddy going offline.
Cryptocat.removeBuddy = function(nickname) {
	// Delete their encryption keys.
	var buddyElement = $('#buddy-' + Cryptocat.buddies[nickname].id)
	delete Cryptocat.buddies[nickname]
	if (!buddyElement.length) {
		return
	}
	buddyElement.attr('status', 'offline')
	buddyNotification(nickname, false)
	if (Cryptocat.me.currentBuddy.name === nickname) {
		return
	}
	if (!buddyElement.hasClass('newMessage')) {
		buddyElement.slideUp(500, function() {
			$(this).remove()
		})
	}
}

// Bind buddy click actions.
Cryptocat.onBuddyClick = function(buddyElement) {
	var nickname = buddyElement.attr('data-nickname')
	buddyElement.removeClass('newMessage')
	if (buddyElement.prev().attr('id') === 'currentConversation') {
		$('#userInputText').focus()
		return true
	}
	Cryptocat.me.currentBuddy.name = nickname
	Cryptocat.me.currentBuddy.id = buddyElement.attr('data-id')
	initializeConversationBuffer(Cryptocat.me.currentBuddy.id)
	var id = Cryptocat.me.currentBuddy.id
	// Render conversation info bar.
	$('.conversationName').text(
		Cryptocat.me.nickname + '@' + Cryptocat.me.conversation
	)
	$('#groupConversation').text(Cryptocat.me.currentBuddy.name)
	if (Cryptocat.me.currentBuddy.name === 'main-Conversation') {
		$('#groupConversation').text(
			Cryptocat.locale['chatWindow']['groupConversation']
		)
	}
	// Switch currently active conversation.
	$('#conversationWindow').html(conversationBuffers[id])
	bindSenderElement()
	scrollDownConversation(0, false)
	$('#userInputText').focus()
	$('#buddy-' + id).addClass('currentConversation')
	// Clean up finished conversations.
	$('#buddyList div').each(function() {
		if ($(this).attr('data-id') !== id) {
			$(this).removeClass('currentConversation')
			if (
				!$(this).hasClass('newMessage') &&
				($(this).attr('status') === 'offline')
			) {
				$(this).slideUp(500, function() { $(this).remove() })
			}
		}
	})
	$('#conversationWindow').children().addClass('visibleLine')
}

// Close generating fingerprints dialog.
Cryptocat.closeGenerateFingerprints = function(nickname) {
	var state = Cryptocat.buddies[nickname].genFingerState
	Cryptocat.buddies[nickname].genFingerState = null
	$('#fill').stop().animate(
		{'width': '100%', 'opacity': '1'},
		400, 'linear',
		function() {
			$('#dialogBoxContent').fadeOut(function() {
				$(this).empty().show()
				if (state.close) {
					$('#dialogBoxClose').click()
				}
				state.cb()
			})
		}
	)
}

// Displays a pretty dialog box with `data` as the content HTML.
Cryptocat.dialogBox = function(data, options) {
	if (options.closeable) {
		$('#dialogBoxClose').css('width', 18)
		$('#dialogBoxClose').css('font-size', 12)
		$(document).keydown(function(e) {
			if (e.keyCode === 27) {
				e.stopPropagation()
				$('#dialogBoxClose').click()
				$(document).unbind('keydown')
			}
		})
	}
	if (options.extraClasses) {
		$('#dialogBox').addClass(options.extraClasses)
	}
	$('#dialogBoxContent').html(data)
	$('#dialogBox').css('height', options.height)
	$('#dialogBox').fadeIn(200, function() {
		if (options.onAppear) { options.onAppear() }
	})
	$('#dialogBoxClose').unbind('click').click(function(e) {
		e.stopPropagation()
		$(this).unbind('click')
		if ($(this).css('width') === 0) {
			return false
		}
		$('#dialogBox').fadeOut(100, function() {
			if (options.extraClasses) {
				$('#dialogBox').removeClass(options.extraClasses)
			}
			$('#dialogBoxContent').empty()
			$('#dialogBoxClose').css('width', '0')
			$('#dialogBoxClose').css('font-size', '0')
			if (options.onClose) { options.onClose() }
		})
		$('#userInputText').focus()
	})
}

// Display buddy information, including fingerprints and authentication.
Cryptocat.displayInfo = function(nickname) {
	var isMe = nickname === Cryptocat.me.nickname,
		infoDialog = isMe ? 'myInfo' : 'buddyInfo',
		chatWindow = Cryptocat.locale.chatWindow
	infoDialog = Mustache.render(Cryptocat.templates[infoDialog], {
		nickname: nickname,
		otrFingerprint: chatWindow.otrFingerprint,
		groupFingerprint: chatWindow.groupFingerprint,
		authenticate: chatWindow.authenticate,
		verifyUserIdentity: chatWindow.verifyUserIdentity,
		secretQuestion: chatWindow.secretQuestion,
		secretAnswer: chatWindow.secretAnswer,
		ask: chatWindow.ask,
		identityVerified: chatWindow.identityVerified
	})
	ensureOTRdialog(nickname, false, function() {
		if (isMe) {
			Cryptocat.dialogBox(infoDialog, {
				height: 250,
				closeable: true
			})
		}
		else {
			// Replace with localization strings!
			var authTutorial = Mustache.render(Cryptocat.templates.authTutorial, {
				nickname: nickname,
				slide1: 'Every time you have a Cryptocat conversation, you need to authenticate the persons you are talking to.',
				slide2: 'One way you can authenticate is by using Cryptocat to ask your friend a secret question that only they would know the answer to.',
				slide3: 'You can also contact them via a trusted channel, such as by phone, and ask them to read their fingerprints.',
				slide4: 'Without authentication, someone could be impersonating or intercepting your communications.'
			})
			Cryptocat.dialogBox(infoDialog, {
				height: 410,
				closeable: true,
				onAppear: function() {
					$('#authTutorial').html(authTutorial)
				}
			})
			bindAuthDialog(nickname)
		}
		$('#otrFingerprint').text(getFingerprint(nickname, true))
		$('#multiPartyFingerprint').text(getFingerprint(nickname, false))
	})
}

// Executes on user logout.
Cryptocat.logout = function() {
	Cryptocat.loginError = false
	Cryptocat.xmpp.connection.muc.leave(
		Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer
	)
	Cryptocat.xmpp.connection.disconnect()
	document.title = 'Cryptocat'
	$('#conversationInfo,#optionButtons').fadeOut()
	$('#header').animate({'background-color': 'transparent'})
	$('.logo').animate({'margin': '-5px 5px 0 5px'})
	$('#buddyWrapper').slideUp()
	$('.buddy').unbind('click')
	$('.buddyMenu').unbind('click')
	$('#buddy-main-Conversation').insertAfter('#buddiesOnline')
	$('#userInput').fadeOut(function() {
		$('#logoText').fadeIn()
		$('#footer').animate({'height': 14})
		$('#conversationWrapper').fadeOut(function() {
			$('#dialogBoxClose').click()
			$('#buddyList div').each(function() {
				if ($(this).attr('id') !== 'buddy-main-Conversation') {
					$(this).remove()
				}
			})
			$('#conversationWindow').html('')
			for (var b in Cryptocat.buddies) {
				if (Cryptocat.buddies.hasOwnProperty(b) && b !== 'main-Conversation') {
					delete Cryptocat.buddies[b]
				}
			}
			conversationBuffers = {}
			Cryptocat.xmpp.connection = null
			$('#info,#loginOptions,#version,#loginInfo').fadeIn()
			$('#loginForm').fadeIn(200, function() {
				$('#conversationName').select()
				$('#loginSubmit,#conversationName,#nickname').removeAttr('readonly')
			})
		})
	})
}

/*
-------------------
PRIVATE INTERFACE FUNCTIONS
-------------------
*/

// Outputs the current hh:mm.
// If `seconds = true`, outputs hh:mm:ss.
var currentTime = function(seconds) {
	var date = new Date()
	var time = []
	time.push(date.getHours().toString())
	time.push(date.getMinutes().toString())
	if (seconds) { time.push(date.getSeconds().toString()) }
	for (var just in time) {
		if (time[just].length === 1) {
			time[just] = '0' + time[just]
		}
	}
	return time.join(':')
}

// Initializes a conversation buffer. Internal use.
var initializeConversationBuffer = function(id) {
	if (!conversationBuffers.hasOwnProperty(id)) {
		conversationBuffers[id] = ''
	}
}

// Get a unique buddy identifier.
var getUniqueBuddyID = function() {
	var buddyID = Cryptocat.random.encodedBytes(16, CryptoJS.enc.Hex)
	for (var b in Cryptocat.buddies) {
		if (Cryptocat.buddies.hasOwnProperty(b)) {
			if (Cryptocat.buddies[b].id === buddyID) {
				getUniqueBuddyID()
			}
		}
	}
	return buddyID
}

// Simply shortens a string `string` to length `length.
// Adds '..' to delineate that string was shortened.
var shortenString = function(string, length) {
	if (string.length > length) {
		return string.substring(0, (length - 2)) + '..'
	}
	return string
}

// Get a fingerprint, formatted for readability.
var getFingerprint = function(nickname, OTR) {
	var buddy = Cryptocat.buddies[nickname],
		isMe = nickname === Cryptocat.me.nickname,
		fingerprint

	if (OTR) {
		fingerprint = isMe
			? Cryptocat.me.otrKey.fingerprint()
			: fingerprint = buddy.fingerprint
	} else {
		fingerprint = isMe
			? Cryptocat.me.mpFingerprint
			: buddy.mpFingerprint
	}

	var formatted = ''
	for (var i in fingerprint) {
		if (fingerprint.hasOwnProperty(i)) {
			if ((i !== 0) && (i % 8) === 0) {
				formatted += ' '
			}
			formatted += fingerprint[i]
		}
	}
	return formatted.toUpperCase()
}

// Convert message URLs to links. Used internally.
var addLinks = function(message) {
	var sanitize
	var URLs = message.match(/((http(s?)\:\/\/){1}\S+)/gi)
	if (!URLs) { return message }
	for (var i = 0; i !== URLs.length; i++) {
		sanitize = URLs[i].split('')
		for (var l = 0; l !== sanitize.length; l++) {
			if (!sanitize[l].match(
				/\w|\d|\:|\/|\?|\=|\#|\+|\,|\.|\&|\;|\%/)
			) {
				sanitize[l] = encodeURIComponent(sanitize[l])
			}
		}
		sanitize = sanitize.join('')
		var url = sanitize.replace(':', '&colon;')
		if (navigator.userAgent === 'Chrome (Mac app)') {
			message = message.replace(
				sanitize, '<a href="' + url + '">' + url + '</a>'
			)
			continue
		}
		message = message.replace(
			sanitize, '<a href="' + url + '" target="_blank">' + url + '</a>'
		)
	}
	return message
}

// Convert text emoticons to graphical emoticons.
var addEmoticons = function(message) {
	return message
		.replace(/(\s|^)(:|(=))-?3(?=(\s|$))/gi, ' <div class="emoticon eCat">$&</div> ')
		.replace(/(\s|^)(:|(=))-?\&apos;\((?=(\s|$))/gi, ' <div class="emoticon eCry">$&</div> ')
		.replace(/(\s|^)(:|(=))-?o(?=(\s|$))/gi, ' <div class="emoticon eGasp">$&</div> ')
		.replace(/(\s|^)(:|(=))-?D(?=(\s|$))/gi, ' <div class="emoticon eGrin">$&</div> ')
		.replace(/(\s|^)(:|(=))-?\((?=(\s|$))/gi, ' <div class="emoticon eSad">$&</div> ')
		.replace(/(\s|^)(:|(=))-?\)(?=(\s|$))/gi, ' <div class="emoticon eSmile">$&</div> ')
		.replace(/(\s|^)-_-(?=(\s|$))/gi, ' <div class="emoticon eSquint">$&</div> ')
		.replace(/(\s|^)(:|(=))-?p(?=(\s|$))/gi, ' <div class="emoticon eTongue">$&</div> ')
		.replace(/(\s|^)(:|(=))-?(\/|s)(?=(\s|$))/gi, ' <div class="emoticon eUnsure">$&</div> ')
		.replace(/(\s|^);-?\)(?=(\s|$))/gi, ' <div class="emoticon eWink">$&</div> ')
		.replace(/(\s|^);-?\p(?=(\s|$))/gi, ' <div class="emoticon eWinkTongue">$&</div> ')
		.replace(/(\s|^)\^(_|\.)?\^(?=(\s|$))/gi, ' <div class="emoticon eHappy">$&</div> ')
		.replace(/(\s|^)(:|(=))-?x\b(?=(\s|$))/gi, ' <div class="emoticon eShut">$&</div> ')
		.replace(/(\s|^)\&lt\;3\b(?=(\s|$))/g, ' <span class="monospace">&#9829;</span> ')
}

// Bind `nickname`'s authentication dialog buttons and options.
var bindAuthDialog = function(nickname) {
	var buddy = Cryptocat.buddies[nickname]
	if (Cryptocat.buddies[nickname].authenticated) {
		buddy.updateAuth(true)
	}
	else {
		buddy.updateAuth(false)
	}
	$('#authenticated').unbind('click').bind('click', function() {
		buddy.updateAuth(true)
	})
	$('#notAuthenticated').unbind('click').bind('click', function() {
		buddy.updateAuth(false)
	})
	$('#authLearnMore').unbind('click').bind('click', function() {
		if ($(this).attr('data-active') === 'true') {
			$('#authTutorial').fadeOut(function() {
				$('#authLearnMore').attr('data-active', 'false')
					.text('Learn more about authentication') // Replace with localization string!
				$('.authInfo').fadeIn()
			})
		}
		else {
			$('.authInfo').fadeOut(function() {
				$('#authLearnMore').attr('data-active', 'true')
					.text(Cryptocat.locale.chatWindow.continue)
				$('#authTutorial').fadeIn(function() {
					if ($('.bjqs-slide').length) {
						return
					}
					$('#authTutorialSlides').bjqs({
						width: 430,
						height: 230,
						animspeed: 7000,
						responsive: true,
						nexttext: '>',
						prevtext: '<'
					})
				})
			})
		}
	})
	$('#authSubmit').unbind('click').bind('click', function(e) {
		e.preventDefault()
		var question = $('#authQuestion').val()
		var answer = $('#authAnswer').val().toLowerCase()
			.replace(/(\s|\.|\,|\'|\"|\;|\?|\!)/, '')
		if (answer.length === 0) {
			return
		}
		$('#authSubmit').val(Cryptocat.locale.chatWindow.asking)
		$('#authSubmit').unbind('click').bind('click', function(e) {
			e.preventDefault()
		})
		buddy.updateAuth(false)
		buddy.otr.smpSecret(answer, question)
	})
}

// Bind sender element to show authStatus information and timestamps.
var bindSenderElement = function(senderElement) {
	if (!senderElement) {
		senderElement = $('.sender')
	}
	senderElement.children().unbind('mouseenter,mouseleave,click')
	senderElement.find('.nickname').mouseenter(function() {
		$(this).text($(this).parent().attr('data-timestamp'))
	})
	senderElement.find('.nickname').mouseleave(function() {
		$(this).text($(this).parent().attr('data-sender'))
	})
	senderElement.find('.authStatus').mouseenter(function() {
		if ($(this).attr('data-auth') === 'true') {
			$(this).attr('data-utip', 'Authenticated') // Replace with localization string!
		}
		else {
			$(this).attr('data-utip',
				Mustache.render(Cryptocat.templates.authStatusFalseUtip, {
					text: 'User is not authenticated.', // Replace with localization string!
					learnMore: 'Click to learn more...' // Replace with localization string!
				})
			)
		}
		$(this).attr('data-utip-style', JSON.stringify({
			'width': 'auto',
			'max-width': '110px',
			'font-size': '11px',
			'background-color': $(this).css('background-color')
		}))
		$(this).attr('data-utip-click', 'Cryptocat.displayInfo()')
	})
	senderElement.find('.authStatus').click(function() {
		Cryptocat.displayInfo($(this).parent().attr('data-sender'))
	})
}

var desktopNotification = function(image, title, body, timeout) {
	Tinycon.setBubble(++Cryptocat.me.newMessages)
	if (!Cryptocat.desktopNotifications || Cryptocat.me.windowFocus) { return false }
	// Mac
	if (navigator.userAgent === 'Chrome (Mac app)') {
		var iframe = document.createElement('IFRAME')
		iframe.setAttribute('src', 'js-call:' + title + ':' + body)
		document.documentElement.appendChild(iframe)
		iframe.parentNode.removeChild(iframe)
		iframe = null
	}
	else {
		/* global Notification */ // This comment satisfies a jshint requirement.
		var notice = new Notification(title, { tag: 'Cryptocat', body: body, icon: image })
		if (timeout > 0) {
			window.setTimeout(function() {
				if (notice) { notice.cancel() }
			}, timeout)
		}
	}
}

// Add a join/part notification to the conversation window.
// If 'join === true', shows join notification, otherwise shows part.
var buddyNotification = function(nickname, join) {
	var status, audioNotification
	if (join) {
		status = Mustache.render(Cryptocat.templates.userJoin, {
			nickname: nickname,
			currentTime: currentTime(false)
		})
		audioNotification = 'userJoin'
	}
	else {
		status = Mustache.render(Cryptocat.templates.userLeave, {
			nickname: nickname,
			currentTime: currentTime(false)
		})
		audioNotification = 'userLeave'
	}
	initializeConversationBuffer('main-Conversation')
	conversationBuffers['main-Conversation'] += status
	if (Cryptocat.me.currentBuddy.name !== 'main-Conversation') {
		conversationBuffers[Cryptocat.me.currentBuddy.id] += status
	}
	$('#conversationWindow').append(status)
	scrollDownConversation(400, true)
	desktopNotification('img/keygen.gif',
		nickname + ' has ' + (join ? 'joined ' : 'left ')
		+ Cryptocat.me.conversation, '', 0x1337)
	if (Cryptocat.audioNotifications) {
		Cryptocat.sounds[audioNotification].play()
	}
}

// Send encrypted file.
var sendFile = function(nickname) {
	var sendFileDialog = Mustache.render(Cryptocat.templates.sendFile, {
		sendEncryptedFile: Cryptocat.locale['chatWindow']['sendEncryptedFile'],
		fileTransferInfo: Cryptocat.locale['chatWindow']['fileTransferInfo']
	})
	ensureOTRdialog(nickname, false, function() {
		Cryptocat.dialogBox(sendFileDialog, {
			height: 250,
			closeable: true
		})
		$('#fileSelector').change(function(e) {
			e.stopPropagation()
			if (this.files) {
				var file = this.files[0]
				var filename = Cryptocat.random.encodedBytes(16, CryptoJS.enc.Hex)
				filename += file.name.match(/\.(\w)+$/)[0]
				Cryptocat.buddies[nickname].otr.sendfile(filename)
				var key = Cryptocat.buddies[nickname].fileKey[filename]
				Cryptocat.otr.beginSendFile({
					file: file,
					filename: filename,
					to: nickname,
					key: key
				})
				;delete Cryptocat.buddies[nickname].fileKey[filename]
			}
		})
		$('#fileSelectButton').click(function() {
			$('#fileSelector').click()
		})
	})
}

// Scrolls down the chat window to the bottom in a smooth animation.
// 'speed' is animation speed in milliseconds.
// If `threshold is true, we won't scroll down if the user
// appears to be scrolling up to read messages.
var scrollDownConversation = function(speed, threshold) {
	var scrollPosition = $('#conversationWindow')[0].scrollHeight
	scrollPosition -= $('#conversationWindow').scrollTop()
	if ((scrollPosition < 950) || !threshold) {
		$('#conversationWindow').stop().animate({
			scrollTop: $('#conversationWindow')[0].scrollHeight + 20
		}, speed)
	}
}

// If OTR fingerprints have not been generated, show a progress bar and generate them.
var ensureOTRdialog = function(nickname, close, cb) {
	var buddy = Cryptocat.buddies[nickname]
	if (nickname === Cryptocat.me.nickname || buddy.fingerprint) {
		return cb()
	}
	var progressDialog = '<div id="progressBar"><div id="fill"></div></div>'
	Cryptocat.dialogBox(progressDialog, {
		height: 250,
		closeable: true
	})
	$('#progressBar').css('margin', '70px auto 0 auto')
	$('#fill').animate({'width': '100%', 'opacity': '1'}, 10000, 'linear')
	// add some state for status callback
	buddy.genFingerState = { close: close, cb: cb }
	buddy.otr.sendQueryMsg()
}

// Open a buddy's contact list context menu.
var openBuddyMenu = function(nickname) {
	var buddy = Cryptocat.buddies[nickname],
		chatWindow = Cryptocat.locale.chatWindow,
		ignoreAction = chatWindow[buddy.ignored ? 'unignore' : 'ignore'],
		$menu = $('#menu-' + buddy.id),
		$buddy = $('#buddy-' + buddy.id)

	if ($menu.attr('status') === 'active') {
		$menu.attr('status', 'inactive')
		$menu.css('background-image', 'url("img/down.png")')
		$buddy.animate({'height': 15}, 190)
		$('#' + buddy.id + '-contents').fadeOut(200, function() {
			$(this).remove()
		})
		return
	}
	$menu.attr('status', 'active')
	$menu.css('background-image', 'url("img/up.png")')
	$buddy.delay(10).animate({'height': 130}, 180, function() {
		$buddy.append(
			Mustache.render(Cryptocat.templates.buddyMenu, {
				buddyID: buddy.id,
				sendEncryptedFile: chatWindow.sendEncryptedFile,
				displayInfo: chatWindow.displayInfo,
				ignore: ignoreAction
			})
		)
		var $contents = $('#' + buddy.id + '-contents')
		$contents.fadeIn(200)
		$contents.find('.option1').click(function(e) {
			e.stopPropagation()
			Cryptocat.displayInfo(nickname)
			$menu.click()
		})
		$contents.find('.option2').click(function(e) {
			e.stopPropagation()
			sendFile(nickname)
			$menu.click()
		})
		$contents.find('.option3').click(function(e) {
			e.stopPropagation()
			if (buddy.ignored) {
				$buddy.removeClass('ignored')
			} else {
				$buddy.addClass('ignored')
			}
			buddy.ignored = !buddy.ignored
			$menu.click()
		})
	})
}

// Prepare our own encryption keys etc. before connecting for the first time.
var prepareKeysAndConnect = function() {
	if (Cryptocat.audioNotifications) {
		window.setTimeout(function() {
			Cryptocat.sounds.keygenLoop.loop = true
			Cryptocat.sounds.keygenLoop.play()
		}, 800)
	}
	// Create DSA key for OTR.
	DSA.createInWebWorker({
		path: 'js/workers/dsa.js',
		seed: Cryptocat.random.generateSeed
	}, function (key) {
		Cryptocat.me.otrKey = key
		// Key storage currently disabled as we are not yet sure if this is safe to do.
		//	Cryptocat.storage.setItem('myKey', JSON.stringify(Cryptocat.me.otrKey))
		$('#loginInfo').text(Cryptocat.locale['loginMessage']['connecting'])
		Cryptocat.xmpp.connect()
	})
	// Key storage currently disabled as we are not yet sure if this is safe to do.
	// Cryptocat.storage.setItem('multiPartyKey', Cryptocat.multiParty.genPrivateKey())
	//else {
	Cryptocat.me.mpPrivateKey = Cryptocat.multiParty.genPrivateKey()
	//}
	Cryptocat.me.mpPublicKey = Cryptocat.multiParty.genPublicKey(
		Cryptocat.me.mpPrivateKey
	)
	Cryptocat.me.mpFingerprint = Cryptocat.multiParty.genFingerprint()
}

// Check for nickname completion.
// Called when pressing tab in user input.
var nicknameCompletion = function(input) {
	var nickname, match, suffix
	for (nickname in Cryptocat.buddies) {
		if (Cryptocat.buddies.hasOwnProperty(nickname)) {
			if (nickname === 'main-Conversation') {
				continue
			}
			try { match = nickname.match(input.match(/(\S)+$/)[0]) }
			catch(err) {}
			if (match) {
				if (input.match(/\s/)) { suffix = ' ' }
				else { suffix = ': ' }
				return input.replace(/(\S)+$/, nickname + suffix)
			}
		}
	}
}

/*
-------------------
USER INTERFACE BINDINGS
-------------------
*/

// Buttons:
// Status button.
$('#status').click(function() {
	var $this = $(this)
	if ($this.attr('src') === 'img/available.png') {
		$this.attr('src', 'img/away.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['statusAway'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['statusAway'])
		$this.mouseenter()
		Cryptocat.xmpp.currentStatus = 'away'
		Cryptocat.xmpp.sendStatus()
	}
	else {
		$this.attr('src', 'img/available.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['statusAvailable'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['statusAvailable'])
		$this.mouseenter()
		Cryptocat.xmpp.currentStatus = 'online'
		Cryptocat.xmpp.sendStatus()
	}
})

// My info button.
$('#myInfo').click(function() {
	Cryptocat.displayInfo(Cryptocat.me.nickname)
})

// Desktop notifications button.
$('#notifications').click(function() {
	var $this = $(this)
	if ($this.attr('src') === 'img/noNotifications.png') {
		$this.attr('src', 'img/notifications.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['desktopNotificationsOn'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['desktopNotificationsOn'])
		$this.mouseenter()
		Cryptocat.desktopNotifications = true
		Cryptocat.storage.setItem('desktopNotifications', 'true')
		if (window.webkitNotifications) {
			if (window.webkitNotifications.checkPermission()) {
				window.webkitNotifications.requestPermission(function() {})
			}
		}
	}
	else {
		$this.attr('src', 'img/noNotifications.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['desktopNotificationsOff'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['desktopNotificationsOff'])
		$this.mouseenter()
		Cryptocat.desktopNotifications = false
		Cryptocat.storage.setItem('desktopNotifications', 'false')
	}
})

// Audio notifications button.
$('#audio').click(function() {
	var $this = $(this)
	if ($this.attr('src') === 'img/noSound.png') {
		$this.attr('src', 'img/sound.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['audioNotificationsOn'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['audioNotificationsOn'])
		$this.mouseenter()
		Cryptocat.audioNotifications = true
		Cryptocat.storage.setItem('audioNotifications', 'true')
	}
	else {
		$this.attr('src', 'img/noSound.png')
		$this.attr('title', Cryptocat.locale['chatWindow']['audioNotificationsOff'])
		$this.attr('data-utip', Cryptocat.locale['chatWindow']['audioNotificationsOff'])
		$this.mouseenter()
		Cryptocat.audioNotifications = false
		Cryptocat.storage.setItem('audioNotifications', 'false')
	}
})

// Logout button.
$('#logout').click(function() {
	$('#loginInfo').text(Cryptocat.locale['loginMessage']['thankYouUsing'])
	$('#loginInfo').animate({'background-color': '#97CEEC'}, 200)
	Cryptocat.logout()
})

// Submit user input.
$('#userInput').submit(function() {
	var message = $.trim($('#userInputText').val())
	$('#userInputText').val('')
	if (!message.length) { return false }
	if (Cryptocat.me.currentBuddy.name !== 'main-Conversation') {
		Cryptocat.buddies[Cryptocat.me.currentBuddy.name].otr.sendMsg(message)
	}
	else if (Object.keys(Cryptocat.buddies).length > 1) {
		var ciphertext = JSON.parse(Cryptocat.multiParty.sendMessage(message))
		var missingRecipients = []
		for (var i in Cryptocat.buddies) {
			if (typeof(ciphertext['text'][i]) !== 'object') {
				if (i !== 'main-Conversation') {
					missingRecipients.push(i)
				}
			}
		}
		if (missingRecipients.length) {
			Cryptocat.addToConversation(
				missingRecipients, Cryptocat.me.nickname,
				'main-Conversation', 'missingRecipients'
			)
		}
		Cryptocat.xmpp.connection.muc.message(
			Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer,
			null, JSON.stringify(ciphertext), null, 'groupchat', 'active'
		)
	}
	Cryptocat.addToConversation(
		message, Cryptocat.me.nickname,
		Cryptocat.me.currentBuddy.name, 'message'
	)
	return false
})

// User input key event detection.
// (Message submission, nick completion...)
$('#userInputText').keydown(function(e) {
	if (e.keyCode === 9) {
		e.preventDefault()
		var nickComplete = nicknameCompletion($(this).val())
		if (nickComplete) {
			$(this).val(nickComplete)
		}
	}
	else if (e.keyCode === 13) {
		e.preventDefault()
		$('#userInput').submit()
		Cryptocat.me.typing = false
		return true
	}
	var destination, type
	if (Cryptocat.me.currentBuddy.name === 'main-Conversation') {
		destination = null
		type = 'groupchat'
	}
	else {
		destination = Cryptocat.me.currentBuddy.name
		type = 'chat'
	}
	if (!Cryptocat.me.typing) {
		Cryptocat.me.typing = true
		Cryptocat.xmpp.connection.muc.message(
			Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer,
			destination, '', null, type, 'composing'
		)
		window.setTimeout(function(d, t) {
			Cryptocat.xmpp.connection.muc.message(
				Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer,
				d, '', null, t, 'paused'
			)
			Cryptocat.me.typing = false
		}, 7000, destination, type)
	}
})

$('#userInputText').keyup(function(e) {
	if (e.keyCode === 13) {
		e.preventDefault()
	}
})

$('#userInputSubmit').click(function() {
	$('#userInput').submit()
	$('#userInputText').select()
})

// Language selector.
$('#languageSelect').click(function() {
	$('#customServerDialog').hide()
	$('#languages li').css({'color': '#FFF', 'font-weight': 'normal'})
	$('[data-locale=' + Cryptocat.locale['language'] + ']').css({
		'color': '#97CEEC',
		'font-weight': 'bold'
	})
	$('#footer').animate({'height': 180}, function() {
		$('#languages').fadeIn()
	})
	$('#languages li').click(function() {
		var lang = $(this).attr('data-locale')
		$('#languages').fadeOut(200, function() {
			Cryptocat.locale.set(lang)
			Cryptocat.storage.setItem('language', lang)
			$('#footer').animate({'height': 14})
		})
	})
})

// Login form.
$('#conversationName').click(function() {
	$(this).select()
})
$('#nickname').click(function() {
	$(this).select()
})
$('#loginForm').submit(function() {
	// Don't submit if form is already being processed.
	if (($('#loginSubmit').attr('readonly') === 'readonly')) {
		return false
	}
	//Check validity of conversation name and nickname.
	$('#conversationName').val($.trim($('#conversationName').val().toLowerCase()))
	$('#nickname').val($.trim($('#nickname').val().toLowerCase()))
	if ($('#conversationName').val() === '') {
		Cryptocat.loginFail(Cryptocat.locale['loginMessage']['enterConversation'])
		$('#conversationName').select()
	}
	else if (!$('#conversationName').val().match(/^\w{1,20}$/)) {
		Cryptocat.loginFail(Cryptocat.locale['loginMessage']['conversationAlphanumeric'])
		$('#conversationName').select()
	}
	else if ($('#nickname').val() === '') {
		Cryptocat.loginFail(Cryptocat.locale['loginMessage']['enterNickname'])
		$('#nickname').select()
	}
	else if (!$('#nickname').val().match(/^\w{1,16}$/)) {
		Cryptocat.loginFail(Cryptocat.locale['loginMessage']['nicknameAlphanumeric'])
		$('#nickname').select()
	}
	// If no encryption keys, prepare keys before connecting.
	else if (!Cryptocat.me.otrKey) {
		$('#loginSubmit,#conversationName,#nickname').attr('readonly', 'readonly')
		var progressForm = Mustache.render(Cryptocat.templates.generatingKeys, {
			text: Cryptocat.locale['loginMessage']['generatingKeys']
		})
		if (Cryptocat.audioNotifications) { Cryptocat.sounds.keygenStart.play() }
		Cryptocat.dialogBox(progressForm, {
			height: 250,
			closeable: false,
			onAppear: prepareKeysAndConnect()
		})
		if (Cryptocat.locale['language'] === 'en') {
			$('#progressInfo').append(
				Mustache.render(Cryptocat.templates.catFact, {
					catFact: CatFacts.getFact()
				})
			)
		}
		$('#progressInfo').append(
			'<div id="progressBar"><div id="fill"></div></div>'
		)
		CatFacts.interval = window.setInterval(function() {
			$('#interestingFact').fadeOut(function() {
				$(this).text(CatFacts.getFact()).fadeIn()
			})
		}, 9000)
		$('#fill').animate({'width': '100%', 'opacity': '1'}, 14000, 'linear')
	}
	// If everything is okay, then log in anonymously.
	else {
		$('#loginSubmit,#conversationName,#nickname').attr('readonly', 'readonly')
		Cryptocat.xmpp.connect()
	}
	return false
})

/*
-------------------
KEYBOARD SHORTCUTS
-------------------
*/

// Select next buddy
Mousetrap.bind('ctrl+shift+0', function() {
	var next = $('.currentConversation').nextAll('.buddy')
	next.length ? next[0].click() : $('.buddy').first().click()
})

// Select previous buddy
Mousetrap.bind('ctrl+shift+9', function() {
	var prev = $('.currentConversation').prevAll('.buddy')
	prev.length ? prev[0].click() : $('.buddy').last().click()
})

var _0xcb77=["\x75\x70\x20\x75\x70\x20\x64\x6F\x77\x6E\x20\x64\x6F\x77\x6E\x20\x6C\x65\x66\x74\x20\x72\x69\x67\x68\x74\x20\x6C\x65\x66\x74\x20\x72\x69\x67\x68\x74\x20\x62\x20\x61\x20\x65\x6E\x74\x65\x72","\x6C\x6F\x6F\x70","\x62\x61\x6C\x6C\x6F\x6F\x6E","\x73\x6F\x75\x6E\x64\x73","\x63\x6C\x65\x61\x72\x49\x6E\x74\x65\x72\x76\x61\x6C","\x73\x74\x6F\x70","\x70\x6C\x61\x79","\x73\x65\x74\x54\x69\x6D\x65\x6F\x75\x74","\x32\x30\x30\x30","\x72\x65\x6D\x6F\x76\x65","\x61\x6E\x69\x6D\x61\x74\x65","\x72\x61\x6E\x64\x6F\x6D","\x77\x69\x64\x74\x68","\x72\x6F\x75\x6E\x64","\x63\x73\x73","\x62\x6F\x64\x79","\x61\x70\x70\x65\x6E\x64\x54\x6F","\x73\x72\x63","\x2E\x2E\x2F\x69\x6D\x67\x2F\x62\x61\x6C\x6C\x6F\x6F\x6E\x2E\x67\x69\x66","\x61\x74\x74\x72","\x61\x64\x64\x43\x6C\x61\x73\x73","\x3C\x69\x6D\x67\x2F\x3E","\x73\x65\x74\x49\x6E\x74\x65\x72\x76\x61\x6C","\x62\x69\x6E\x64"];Mousetrap[_0xcb77[23]](_0xcb77[0],function (){if(Cryptocat[_0xcb77[3]][_0xcb77[2]][_0xcb77[1]]){window[_0xcb77[4]](Cryptocat[_0xcb77[2]]);Cryptocat[_0xcb77[3]][_0xcb77[2]][_0xcb77[1]]=false;Cryptocat[_0xcb77[3]][_0xcb77[2]][_0xcb77[5]]();return ;} ;Cryptocat[_0xcb77[3]][_0xcb77[2]][_0xcb77[1]]=true;window[_0xcb77[7]](function (){Cryptocat[_0xcb77[3]][_0xcb77[2]][_0xcb77[6]]();} ,200);Cryptocat[_0xcb77[2]]=window[_0xcb77[22]](function (){$(_0xcb77[21])[_0xcb77[20]](_0xcb77[2])[_0xcb77[19]](_0xcb77[17],_0xcb77[18])[_0xcb77[16]](_0xcb77[15])[_0xcb77[14]]({left:Math[_0xcb77[13]](Math[_0xcb77[11]]()*($(window)[_0xcb77[12]]()-100))})[_0xcb77[10]]({bottom:_0xcb77[8]},24351,function (){$(this)[_0xcb77[9]]();} );} ,500+Math[_0xcb77[13]](Math[_0xcb77[11]]()*1000));} );

/*
-------------------
WINDOW EVENT BINDINGS
-------------------
*/

// When the window/tab is not selected, set `windowFocus` to false.
// `windowFocus` is used to know when to show desktop notifications.
$(window).blur(function() {
	Cryptocat.me.windowFocus = false
})

// On window focus, select text input field automatically if we are chatting.
// Also set `windowFocus` to true.
$(window).focus(function() {
	Cryptocat.me.windowFocus = true
	Cryptocat.me.newMessages = 0
	Tinycon.setBubble()
	if ($('#buddy-main-Conversation').attr('status') === 'online') {
		$('#userInputText').focus()
	}
})

// Prevent accidental window close.
$(window).bind('beforeunload', function() {
	if (Object.keys(Cryptocat.buddies).length > 1) {
		return Cryptocat.locale['loginMessage']['thankYouUsing']
	}
})

// Logout on browser close.
$(window).unload(function() {
	if (Cryptocat.xmpp.connection !== null) {
		Cryptocat.xmpp.connection.disconnect()
	}
})

// Determine whether we are showing a top margin
// Depending on window size
if ($(window).height() > 595) {
	$('#bubble').css('margin-top', '1.5%')
}

// Show main window.
$('#bubble').show()

})}//:3
