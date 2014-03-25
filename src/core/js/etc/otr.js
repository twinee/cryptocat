;(function() {
'use strict';

// Cryptocat OTR functions and callbacks.
Cryptocat.otr = {}

// Handle incoming messages.
var onIncoming = function(nickname, msg, encrypted) {
	// drop unencrypted messages
	if (encrypted) {
		Cryptocat.addToConversation(msg, nickname, nickname, 'message')
		if (Cryptocat.me.currentBuddy.name !== nickname) {
			Cryptocat.messagePreview(msg, nickname)
		}
	}
}

// Handle outgoing messages.
var onOutgoing = function(nickname, message) {
	Cryptocat.xmpp.connection.muc.message(
		Cryptocat.me.conversation
			+ '@'
			+ Cryptocat.xmpp.conferenceServer,
		nickname, message, null, 'chat', 'active'
	)
}

// Handle otr state changes.
var onStatusChange = function(nickname, state) {
	/*jshint camelcase:false */
	var buddy = Cryptocat.buddies[nickname]
	if (state === OTR.CONST.STATUS_AKE_SUCCESS) {
		var fingerprint = buddy.otr.their_priv_pk.fingerprint()
		if (buddy.fingerprint === null) {
			buddy.fingerprint = fingerprint
			Cryptocat.closeGenerateFingerprints(nickname)
		}
		else if (buddy.fingerprint !== fingerprint) {
			// re-aked with a different key
			buddy.fingerprint = fingerprint
			Cryptocat.onReAKE(nickname)
		}
	}
}

// Store received filename.
var onFile = function(nickname, type, key, filename) {
	var buddy = Cryptocat.buddies[nickname]
	key = CryptoJS.SHA512(CryptoJS.enc.Latin1.parse(key))
	key = key.toString(CryptoJS.enc.Latin1)
	if (!buddy.fileKey) {
		buddy.fileKey = {}
	}
	buddy.fileKey[filename] = [
		key.substring(0, 32), key.substring(32)
	]
}

// Receive an SMP question
var onSMPQuestion = function(nickname, question) {
	var chatWindow = Cryptocat.locale.chatWindow,
		buddy = Cryptocat.buddies[nickname],
		answer = false
	var info = Mustache.render(Cryptocat.templates.authRequest, {
		authenticate: chatWindow.authenticate,
		authRequest: chatWindow.authRequest.replace('(NICKNAME)', nickname),
		answerMustMatch: chatWindow.answerMustMatch
			.replace('(NICKNAME)', nickname),
		question: question,
		answer: chatWindow.answer
	})
	$('#dialogBoxClose').click()
	window.setTimeout(function() {
		Cryptocat.dialogBox(info, {
			height: 240,
			closeable: true,
			onAppear: function() {
				$('#authReplySubmit').unbind('click').bind('click', function(e) {
					e.preventDefault()
					answer = $('#authReply').val().toLowerCase()
						.replace(/(\s|\.|\,|\'|\"|\;|\?|\!)/, '')
					if (buddy.mpFingerprint) {
						answer += buddy.mpFingerprint + Cryptocat.me.mpFingerprint
					}
					buddy.otr.smpSecret(answer)
					$('#dialogBoxClose').click()
				})
			},
			onClose: function() {
				if (answer) { return }
				buddy.otr.smpSecret(
					Cryptocat.random.encodedBytes(16, CryptoJS.enc.Hex)
				)
			}
		})
	}, 500)
}

// Handle SMP callback
var onSMPAnswer = function(nickname, type, data, act) {
	var chatWindow = Cryptocat.locale.chatWindow,
		buddy = Cryptocat.buddies[nickname]
	switch(type) {
	case 'question':
		onSMPQuestion(nickname, data)
		break
	case 'trust':
		if (act === 'asked') {
			// set authentication result
			buddy.updateAuth(data)
			if ($('.authSMP').length) {
				if (buddy.authenticated) {
					$('#authSubmit').val(chatWindow.identityVerified)
					$('#authenticated').click()
				}
				else {
					$('#authSubmit').val(chatWindow.failed)
						.animate({'background-color': '#F00'})
				}
			}
		}
		break
	case 'abort':
		if ($('.authSMP').length) {
			$('#authSubmit').val(chatWindow.failed)
				.animate({'background-color': '#F00'})
		}
		break
	}
}

// Construct a new OTR conversation
Cryptocat.otr.add = function(nickname) {
	var otr = new OTR({
		priv: Cryptocat.me.otrKey,
		smw: {
			path: 'js/workers/smp.js',
			seed: Cryptocat.random.generateSeed
		}
	})
	otr.REQUIRE_ENCRYPTION = true
	otr.on('ui', onIncoming.bind(null, nickname))
	otr.on('io', onOutgoing.bind(null, nickname))
	otr.on('smp', onSMPAnswer.bind(null, nickname))
	otr.on('status', onStatusChange.bind(null, nickname))
	otr.on('file', onFile.bind(null, nickname))
	return otr
}

}())
