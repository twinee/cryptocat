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
	'keygenLoop': (new Audio('snd/keygenLoop' + Cryptocat.audioExt)),
	'keygenEnd': (new Audio('snd/keygenEnd' + Cryptocat.audioExt)),
	'userLeave': (new Audio('snd/userLeave' + Cryptocat.audioExt)),
	'userJoin': (new Audio('snd/userJoin' + Cryptocat.audioExt)),
	'msgGet': (new Audio('snd/msgGet' + Cryptocat.audioExt))
}

/*
-------------------
END GLOBAL SCOPE
-------------------
*/

if (typeof(window) !== 'undefined') { $(window).ready(function() {

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
	initializeConversationBuffer(conversation)
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
	message = message.replace(/:/g, '&#58;')
	message = Mustache.render(Cryptocat.templates.message, {
		lineDecoration: lineDecoration,
		nickname: shortenString(nickname, 16),
		currentTime: currentTime(true),
		message: message
	})
	if (type !== 'composing') {
		conversationBuffers[Cryptocat.buddies[conversation].id] += message
	}
	if (conversation === Cryptocat.me.currentBuddy.name) {
		$('#conversationWindow').append(message)
		$('.line' + lineDecoration).last().animate({'top': '0', 'opacity': '1'}, 100)
		bindSenderElement($('.line' + lineDecoration).last().find('.sender'))
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

// Modify the "Display Info" dialog to show that a user is authenticated.
// `speed` is animation speed.
Cryptocat.showAuthenticated = function(nickname, speed) {
	$('#authInfo').children()
		.not('#otrFingerprintWrapper')
		.not('#authVerified')
		.fadeOut(speed, function() { $(this).remove() })
	window.setTimeout(function() {
		$('#authInfo').animate({
			'height': 100,
			'background-color': '#97CEEC'
		}, speed, function() {
			$('#authVerified').fadeIn(speed)
		})
	}, speed)
}

// Handles login failures.
Cryptocat.loginFail = function(message) {
	$('#loginInfo').text(message)
	$('#bubble').animate({'left': '+=5px'}, 130)
		.animate({'left': '-=10px'}, 130)
		.animate({'left': '+=5px'}, 130)
	$('#loginInfo').animate({'background-color': '#E93028'}, 200)
}

// Build new buddy.
Cryptocat.addBuddy = function(nickname) {
	Cryptocat.buddies[nickname] = {
		id: getUniqueBuddyID(),
		ignored: false,
		authenticated: false,
		otrKey: null,
		fileKey: null,
		mpPublicKey: null,
		mpFingerprint: null,
		mpSecretKey: null
	}
	$('#buddyList').queue(function() {
		var buddyTemplate = Mustache.render(Cryptocat.templates.buddy, {
			buddyID: Cryptocat.buddies[nickname].id,
			nickname: nickname,
			shortNickname: shortenString(nickname, 12)
		})
		$(buddyTemplate).insertAfter('#buddiesOnline').slideDown(100, function() {
			$('#buddy-' + Cryptocat.buddies[nickname].id)
				.unbind('click')
				.click(function() {
					Cryptocat.onBuddyClick($(this))
				}
			)
			$('#menu-' + Cryptocat.buddies[nickname].id).attr('status', 'inactive')
				.unbind('click')
				.click(function(e) {
					e.stopPropagation()
					openBuddyMenu(nickname)
				}
			)
			Cryptocat.otr.add(nickname)
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
	if (nickname === 'main-Conversation') {
		buddyElement
			.css('background-image', 'url("img/groupChat.png")')
	}
	if (Cryptocat.me.currentBuddy.id) {
		var buddyStatus = $('#buddy-' + Cryptocat.me.currentBuddy.id)
			.attr('status')
		if (buddyStatus === 'online') {
			$('#buddy-' + Cryptocat.me.currentBuddy.id)
				.insertAfter('#buddiesOnline').slideDown(100)
		}
		else if (buddyStatus === 'away') {
			$('#buddy-' + Cryptocat.me.currentBuddy.id)
				.insertAfter('#buddiesAway').slideDown(100)
		}
	}
	Cryptocat.me.currentBuddy.name = nickname
	Cryptocat.me.currentBuddy.id = buddyElement.attr('data-id')
	initializeConversationBuffer(Cryptocat.me.currentBuddy.id)
	switchConversation(Cryptocat.me.currentBuddy.id)
	$('#conversationWindow').children().addClass('visibleLine')
}

// Close generating fingerprints dialog.
Cryptocat.closeGenerateFingerprints = function(nickname, arr) {
	var close = arr[0]
	var cb = arr[1]
	$('#fill').stop().animate(
		{'width': '100%', 'opacity': '1'},
		400, 'linear',
		function() {
			$('#dialogBoxContent').fadeOut(function() {
				$(this).empty().show()
				if (close) {
					$('#dialogBoxClose').click()
				}
				cb()
			})
		}
	)
}

// Displays a pretty dialog box with `data` as the content HTML.
// If `closeable = true`, then the dialog box has a close button on the top right.
// `height` is the height of the dialog box, in pixels.
// onAppear may be defined as a callback function to execute on dialog box appear.
// onClose may be defined as a callback function to execute on dialog box close.
Cryptocat.dialogBox = function(data, height, closeable, onAppear, onClose) {
	if (closeable) {
		$('#dialogBoxClose').css('width', 18)
		$('#dialogBoxClose').css('font-size', 12)
	}
	$('#dialogBoxContent').html(data)
	$('#dialogBox').css('height', height)
	$('#dialogBox').fadeIn(200, function() {
		if (onAppear) { onAppear() }
	})
	$('#dialogBoxClose').unbind('click').click(function(e) {
		e.stopPropagation()
		$(this).unbind('click')
		if ($(this).css('width') === 0) {
			return false
		}
		$('#dialogBox').fadeOut(100, function() {
			$('#dialogBoxContent').empty()
			$('#dialogBoxClose').css('width', '0')
			$('#dialogBoxClose').css('font-size', '0')
			if (onClose) { onClose() }
		})
		$('#userInputText').focus()
	})
	if (closeable) {
		$(document).keydown(function(e) {
			if (e.keyCode === 27) {
				e.stopPropagation()
				$('#dialogBoxClose').click()
				$(document).unbind('keydown')
			}
		})
	}
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

// Creates a template for the conversation info bar at the top of each conversation.
var buildConversationInfo = function(conversation) {
	$('.conversationName').text(
		Cryptocat.me.nickname + '@' + Cryptocat.me.conversation
	)
	if (conversation === 'main-Conversation') {
		$('#groupConversation').text(
			Cryptocat.locale['chatWindow']['groupConversation']
		)
	}
	else {
		$('#groupConversation').text(conversation)
	}
}

// Switches the currently active conversation.
var switchConversation = function(id) {
	buildConversationInfo(Cryptocat.me.currentBuddy.name)
	$('#conversationWindow').html(conversationBuffers[Cryptocat.me.currentBuddy.id])
	bindSenderElement()
	scrollDownConversation(0, false)
	$('#userInputText').focus()
	$('#buddy-' + id).addClass('currentConversation')
	var buddyPosition = $('#buddy-' + id).prev().attr('id')
	if ((buddyPosition === 'buddiesOnline') || ((buddyPosition === 'buddiesAway')
		&& ($('#buddiesOnline').next().attr('id') === 'buddiesAway'))) {
		$('#buddy-' + id).insertAfter('#currentConversation')
	}
	else {
		$('#buddy-' + id).insertAfter('#currentConversation').slideDown(100)
	}
	// Clean up finished conversations.
	$('#buddyList div').each(function() {
		if ($(this).attr('data-id') !== id) {
			$(this).removeClass('currentConversation')
			if (!$(this).hasClass('newMessage') && ($(this).attr('status') === 'offline')) {
				$(this).slideUp(500, function() { $(this).remove() })
			}
		}
	})
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
	var fingerprint
	if (OTR) {
		if (nickname === Cryptocat.me.nickname) {
			fingerprint = Cryptocat.me.otrKey.fingerprint()
		}
		else {
			/* jshint -W106 */
			fingerprint = Cryptocat.buddies[nickname].otrKey
				.their_priv_pk.fingerprint()
			/* jshint +W106 */
		}
	}
	else {
		if (nickname === Cryptocat.me.nickname) {
			fingerprint = Cryptocat.me.mpFingerprint
		}
		else {
			fingerprint = Cryptocat.buddies[nickname]
				.mpFingerprint
		}
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

// Bind sender element to show authStatus information and timestamps.
var bindSenderElement = function(senderElement) {
	if (!senderElement) {
		senderElement = $('.sender')
	}
	senderElement.children().unbind('mouseenter,mouseleave')
	senderElement.mouseenter(function() {
		$(this).find('.nickname').text($(this).attr('timestamp'))
	})
	senderElement.mouseleave(function() {
		$(this).find('.nickname').text($(this).attr('sender'))
	})
	/*
	senderElement.find('.authStatusNo').mouseenter(function() {
		$(this).attr('data-utip-style', JSON.stringify({
			'font-size': '11px',
			'width': '130px',
			'cursor': 'pointer',
		}))
		$(this).find('.nickname').text($(this).attr('timestamp'))
	})
	senderElement.find('.authStatusNo').mouseleave(function() {
		$(this).find('.nickname').text($(this).attr('sender'))
	})
	*/
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
		Cryptocat.dialogBox(sendFileDialog, 240, true)
		$('#fileSelector').change(function(e) {
			e.stopPropagation()
			if (this.files) {
				var file = this.files[0]
				var filename = Cryptocat.random.encodedBytes(16, CryptoJS.enc.Hex)
				filename += file.name.match(/\.(\w)+$/)[0]
				Cryptocat.buddies[nickname].otrKey.sendfile(filename)
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
	var scrollPosition = $('#conversationWindow')[0].scrollHeight - $('#conversationWindow').scrollTop()
	if ((scrollPosition < 950) || !threshold) {
		$('#conversationWindow').stop().animate({
			scrollTop: $('#conversationWindow')[0].scrollHeight + 20
		}, speed)
	}
}

// If OTR fingerprints have not been generated, show a progress bar and generate them.
var ensureOTRdialog = function(nickname, close, cb) {
	if (nickname === Cryptocat.me.nickname || Cryptocat.buddies[nickname].otrKey.msgstate) {
		return cb()
	}
	var progressDialog = '<div id="progressBar"><div id="fill"></div></div>'
	Cryptocat.dialogBox(progressDialog, 240, true)
	$('#progressBar').css('margin', '70px auto 0 auto')
	$('#fill').animate({'width': '100%', 'opacity': '1'}, 10000, 'linear')
	// add some state for status callback
	Cryptocat.buddies[nickname].otrKey.genFingerCb = [close, cb]
	Cryptocat.buddies[nickname].otrKey.sendQueryMsg()
}

// Display buddy information, including fingerprints and authentication.
var displayInfo = function(nickname) {
	var infoDialog
	if (nickname === Cryptocat.me.nickname) {
		infoDialog = 'myInfo'
	}
	else {
		infoDialog = 'buddyInfo'
	}
	infoDialog = Mustache.render(Cryptocat.templates[infoDialog], {
		nickname: nickname,
		otrFingerprint: Cryptocat.locale['chatWindow']['otrFingerprint'],
		groupFingerprint: Cryptocat.locale['chatWindow']['groupFingerprint'],
		authenticate: Cryptocat.locale['chatWindow']['authenticate'],
		verifyUserIdentity: Cryptocat.locale['chatWindow']['verifyUserIdentity'],
		secretQuestion: Cryptocat.locale['chatWindow']['secretQuestion'],
		secretAnswer: Cryptocat.locale['chatWindow']['secretAnswer'],
		ask: Cryptocat.locale['chatWindow']['ask'],
		identityVerified: Cryptocat.locale['chatWindow']['identityVerified']
	})
	ensureOTRdialog(nickname, false, function() {
		if ((nickname === Cryptocat.me.nickname) || Cryptocat.buddies[nickname].authenticated) {
			Cryptocat.dialogBox(infoDialog, 250, true)
			if (nickname !== Cryptocat.me.nickname) {
				Cryptocat.showAuthenticated(nickname, 0)
			}
		}
		else {
			Cryptocat.dialogBox(infoDialog, 340, true)
			$('#authSubmit').unbind('click').bind('click', function(e) {
				e.preventDefault()
				var question = $('#authQuestion').val()
				var answer = $('#authAnswer').val().toLowerCase()
					.replace(/(\s|\.|\,|\'|\"|\;|\?|\!)/, '')
				if (answer.length === 0) {
					// a secret is required!
					return
				}
				$('#authSubmit').val(Cryptocat.locale['chatWindow']['asking'])
				$('#authSubmit').unbind('click').bind('click', function(e) {
					e.preventDefault()
				})
				Cryptocat.buddies[nickname].otrKey.smpSecret(answer, question)
			})
		}
		$('#otrFingerprint').text(getFingerprint(nickname, true))
		$('#multiPartyFingerprint').text(getFingerprint(nickname, false))
	})
}

// Open a buddy's contact list context menu.
var openBuddyMenu = function(nickname) {
	if ($('#menu-' + Cryptocat.buddies[nickname].id).attr('status') === 'active') {
		$('#menu-' + Cryptocat.buddies[nickname].id).attr('status', 'inactive')
		$('#menu-' + Cryptocat.buddies[nickname].id).css('background-image', 'url("img/down.png")')
		$('#buddy-' + Cryptocat.buddies[nickname].id).animate({'height': 15}, 190)
		$('#' + Cryptocat.buddies[nickname].id + '-contents').fadeOut(200, function() {
			$('#' + Cryptocat.buddies[nickname].id + '-contents').remove()
		})
		return
	}
	var ignoreAction = Cryptocat.locale['chatWindow']['ignore']
	$('#menu-' + Cryptocat.buddies[nickname].id).attr('status', 'active')
	$('#menu-' + Cryptocat.buddies[nickname].id).css('background-image', 'url("img/up.png")')
	if (Cryptocat.buddies[nickname].ignored) {
		ignoreAction = Cryptocat.locale['chatWindow']['unignore']
	}
	$('#buddy-' + Cryptocat.buddies[nickname].id).delay(10).animate({'height': 130}, 180, function() {
		$('#buddy-' + Cryptocat.buddies[nickname].id).append(
			Mustache.render(Cryptocat.templates.buddyMenu, {
				buddyID: Cryptocat.buddies[nickname].id,
				sendEncryptedFile: Cryptocat.locale['chatWindow']['sendEncryptedFile'],
				displayInfo: Cryptocat.locale['chatWindow']['displayInfo'],
				ignore: ignoreAction
			})
		)
		$('#' + Cryptocat.buddies[nickname].id + '-contents').fadeIn(200)
		$('#' + Cryptocat.buddies[nickname].id + '-contents').find('.option1').click(function(e) {
			e.stopPropagation()
			displayInfo(nickname)
			$('#menu-' + Cryptocat.buddies[nickname].id).click()
		})
		$('#' + Cryptocat.buddies[nickname].id + '-contents').find('.option2').click(function(e) {
			e.stopPropagation()
			sendFile(nickname)
			$('#menu-' + Cryptocat.buddies[nickname].id).click()
		})
		$('#' + Cryptocat.buddies[nickname].id + '-contents').find('.option3').click(function(e) {
			e.stopPropagation()
			if (Cryptocat.buddies[nickname].ignored) {
				Cryptocat.buddies[nickname].ignored = false
				$('#buddy-' + Cryptocat.buddies[nickname].id).removeClass('ignored')
			}
			else {
				Cryptocat.buddies[nickname].ignored = true
				$('#buddy-' + Cryptocat.buddies[nickname].id).addClass('ignored')
			}
			$('#menu-' + Cryptocat.buddies[nickname].id).click()
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
	displayInfo(Cryptocat.me.nickname)
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
		Cryptocat.buddies[Cryptocat.me.currentBuddy.name].otrKey.sendMsg(message)
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
		Cryptocat.dialogBox(progressForm, 240, false, prepareKeysAndConnect())
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
