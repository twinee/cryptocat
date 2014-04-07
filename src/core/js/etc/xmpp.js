// Cryptocat XMPP functions and callbacks.

Cryptocat.xmpp = {}
Cryptocat.xmpp.currentStatus = 'online'
Cryptocat.xmpp.connection = null

// Default connection settings.
Cryptocat.xmpp.defaultDomain = 'crypto.cat'
Cryptocat.xmpp.defaultConferenceServer = 'conference.crypto.cat'
Cryptocat.xmpp.defaultRelay = 'https://crypto.cat/http-bind'

Cryptocat.xmpp.domain = Cryptocat.xmpp.defaultDomain
Cryptocat.xmpp.conferenceServer = Cryptocat.xmpp.defaultConferenceServer
Cryptocat.xmpp.relay = Cryptocat.xmpp.defaultRelay

$(window).ready(function() {
'use strict';

// connect anonymously and join conversation.
Cryptocat.xmpp.connect = function() {
	Cryptocat.me.conversation = Strophe.xmlescape($('#conversationName').val())
	Cryptocat.me.nickname = Strophe.xmlescape($('#nickname').val())
	Cryptocat.xmpp.connection = new Strophe.Connection(Cryptocat.xmpp.relay)
	Cryptocat.xmpp.connection.connect(Cryptocat.xmpp.domain, null, function(status) {
		if (status === Strophe.Status.CONNECTING) {
			$('#loginInfo').animate({'background-color': '#97CEEC'}, 200)
			$('#loginInfo').text(Cryptocat.locale['loginMessage']['connecting'])
		}
		else if (status === Strophe.Status.CONNECTED) {
			afterConnect()
			Cryptocat.xmpp.connection.muc.join(
				Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer,
				Cryptocat.me.nickname,
				function(message) {
					if (Cryptocat.xmpp.onMessage(message))   { return true }
				},
				function(presence) {
					if (Cryptocat.xmpp.onPresence(presence)) { return true }
				}
			)
			$('#fill').stop().animate({
				'width': '100%', 'opacity': '1'
			}, 250, 'linear', function() {
				window.setTimeout(function() {
					$('#dialogBoxClose').click()
				}, 200)
			})
			window.setTimeout(function() {
				Cryptocat.xmpp.onConnected()
			}, 400)
		}
		else if ((status === Strophe.Status.CONNFAIL) || (status === Strophe.Status.DISCONNECTED)) {
			if (Cryptocat.loginError) {
				Cryptocat.xmpp.reconnect()
			}
		}
	})
}

// Executes on successfully completed XMPP connection.
Cryptocat.xmpp.onConnected = function() {
	clearInterval(CatFacts.interval)
	Cryptocat.storage.setItem('myNickname', Cryptocat.me.nickname)
	$('#buddy-groupChat').attr('status', 'online')
	$('#loginInfo').text('✓')
	$('#info').fadeOut(200)
	$('#loginOptions,#languages,#customServerDialog,#version,#logoText,#loginInfo').fadeOut(200)
	$('#header').animate({'background-color': '#151520'})
	$('.logo').animate({'margin': '-11px 5px 0 0'})
	$('#loginForm').fadeOut(200, function() {
		$('#conversationInfo').fadeIn()
		$('#buddy-groupChat').click(function() {
			Cryptocat.onBuddyClick($(this))
		})
		$('#buddy-groupChat').click()
		$('#conversationWrapper').fadeIn()
		$('#optionButtons').fadeIn()
		$('#footer').delay(200).animate({'height': 60}, function() {
			$('#userInput').fadeIn(200, function() {
				$('#userInputText').focus()
			})
		})
		$('#buddyWrapper').slideDown()
	})
	Cryptocat.loginError = true
	document.title = Cryptocat.me.nickname + '@' + Cryptocat.me.conversation
}

// Reconnect to the same chatroom, on accidental connection loss.
Cryptocat.xmpp.reconnect = function() {
	Cryptocat.multiParty.reset()
	if (Cryptocat.xmpp.connection) {
	    Cryptocat.xmpp.connection.reset()
	}
	Cryptocat.xmpp.connection = new Strophe.Connection(Cryptocat.xmpp.relay)
	Cryptocat.xmpp.connection.connect(Cryptocat.xmpp.domain, null, function(status) {
		if (status === Strophe.Status.CONNECTING) {
			$('.conversationName').animate({'background-color': '#F00'})
		}
		else if (status === Strophe.Status.CONNECTED) {
			afterConnect()
			Cryptocat.xmpp.connection.muc.join(
				Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer,
				Cryptocat.me.nickname
			)
		}
		else if ((status === Strophe.Status.CONNFAIL) || (status === Strophe.Status.DISCONNECTED)) {
			if (Cryptocat.loginError) {
				window.setTimeout(function() {
					Cryptocat.xmpp.reconnect()
				}, 5000)
			}
		}
	})
}

// Handle incoming messages from the XMPP server.
Cryptocat.xmpp.onMessage = function(message) {
	var nickname = cleanNickname($(message).attr('from'))
	var body = $(message).find('body').text()
	var type = $(message).attr('type')
	// If archived message, ignore.
	if ($(message).find('delay').length !== 0) {
		return true
	}
	//If message is from me, ignore.
	if (nickname === Cryptocat.me.nickname) {
		return true
	}
	// If message is from someone not on buddy list, ignore.
	if (!Cryptocat.buddies.hasOwnProperty(nickname)) {
		return true
	}
	// Check if message has a 'composing' notification.
	if ($(message).find('composing').length && !body.length) {
		var conversation
		if (type === 'groupchat') {
			conversation = 'groupChat'
		}
		else if (type === 'chat') {
			conversation = Cryptocat.buddies[nickname].id
		}
		Cryptocat.addToConversation('', nickname, conversation, 'composing')
		return true
	}
	// Check if we have a 'composing' bubble for that buddy.
	// Check if message has a 'paused' (stopped writing) notification.
	if (
		$('#composing-' + Cryptocat.buddies[nickname].id).length
		&& $(message).find('paused').length
	) {
		$('#composing-' + Cryptocat.buddies[nickname].id).parent().fadeOut(100).remove()
	}
	// Check if message is a group chat message.
	else if (type === 'groupchat' && body.length) {
		body = Cryptocat.multiParty.receiveMessage(nickname, Cryptocat.me.nickname, body)
		if (typeof(body) === 'string') {
			Cryptocat.addToConversation(body, nickname, 'groupChat', 'message')
		}
	}
	// Check if this is a private OTR message.
	else if (type === 'chat') {
		Cryptocat.buddies[nickname].otr.receiveMsg(body)
	}
	return true
}

// Handle incoming presence updates from the XMPP server.
Cryptocat.xmpp.onPresence = function(presence) {
	var status, color, placement
	var nickname = cleanNickname($(presence).attr('from'))
	// If invalid nickname, do not process
	if ($(presence).attr('type') === 'error') {
		if ($(presence).find('error').attr('code') === '409') {
			// Delay logout in order to avoid race condition with window animation
			window.setTimeout(function() {
				Cryptocat.logout()
				Cryptocat.loginFail(Cryptocat.locale['loginMessage']['nicknameInUse'])
			}, 3000)
			return false
		}
		return true
	}
	// Ignore if presence status is coming from myself
	if (nickname === Cryptocat.me.nickname) {
		return true
	}
	// Detect nickname change (which may be done by non-Cryptocat XMPP clients)
	if ($(presence).find('status').attr('code') === '303') {
		Cryptocat.removeBuddy(nickname)
		return true
	}
	// Detect buddy going offline.
	if ($(presence).attr('type') === 'unavailable') {
		Cryptocat.removeBuddy(nickname)
		return true
	}
	// Create buddy element if buddy is new.
	else if (!Cryptocat.buddies.hasOwnProperty(nickname)) {
		Cryptocat.addBuddy(nickname)
	}
	// Handle buddy status change to 'available'.
	else if ($(presence).find('show').text() === '' || $(presence).find('show').text() === 'chat') {
		if ($('#buddy-' + Cryptocat.buddies[nickname].id).attr('status') !== 'online') {
			status = 'online'
			placement = '#buddiesOnline'
		}
	}
	// Handlebuddy status change to 'away'.
	else if ($('#buddy-' + Cryptocat.buddies[nickname].id).attr('status') !== 'away') {
		status = 'away'
		placement = '#buddiesAway'
	}
	// Perform status change.
	$('#buddy-' + Cryptocat.buddies[nickname].id).attr('status', status)
	if (placement) {
		$('#buddy-' + Cryptocat.buddies[nickname].id).animate({'color': color }, function() {
			if (Cryptocat.me.currentBuddy !== Cryptocat.buddies[nickname].id) {
				$(this).insertAfter(placement).slideDown(200)
			}
		})
	}
	return true
}

// Send your own multiparty public key to `nickname`, via XMPP-MUC.
Cryptocat.xmpp.sendPublicKey = function(nickname) {
	Cryptocat.xmpp.connection.muc.message(
		Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer,
		null, Cryptocat.multiParty.sendPublicKey(nickname), null, 'groupchat', 'active'
	)
}

// Send your current status to the XMPP server.
Cryptocat.xmpp.sendStatus = function() {
	if (Cryptocat.xmpp.currentStatus === 'away') {
		Cryptocat.xmpp.connection.muc.setStatus(Cryptocat.me.conversation + '@'
		+ Cryptocat.xmpp.conferenceServer, Cryptocat.me.nickname, 'away', 'away')
	}
	else {
		Cryptocat.xmpp.connection.muc.setStatus(Cryptocat.me.conversation + '@'
		+ Cryptocat.xmpp.conferenceServer, Cryptocat.me.nickname, '', '')
	}
}

// Executed (manually) after connection.
var afterConnect = function() {
	$('.conversationName').animate({'background-color': '#97CEEC'})
	// Cryptocat.xmpp.connection.ibb.addIBBHandler(Cryptocat.otr.ibbHandler)
	/* jshint -W106 */
	// Cryptocat.xmpp.connection.si_filetransfer.addFileHandler(Cryptocat.otr.fileHandler)
	/* jshint +W106 */
	if (Cryptocat.audioNotifications) {
		Cryptocat.sounds.keygenLoop.pause()
		Cryptocat.sounds.keygenEnd.play()
	}
}

// Clean nickname so that it's safe to use.
var cleanNickname = function(nickname) {
	var clean = nickname.match(/\/([\s\S]+)/)
	if (clean) {
		return clean[1]
	}
	return false
}

})
