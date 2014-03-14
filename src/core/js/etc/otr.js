'use strict';

Cryptocat.otr = {}

Cryptocat.otr.fileSize = 5120 // Maximum encrypted file sharing size, in kilobytes.
Cryptocat.otr.chunkSize = 64511 // Size in which file chunks are split, in bytes.

// Cryptocat OTR functions and callbacks.

// OTR functions:
// Handle incoming messages.
Cryptocat.otr.onIncoming = function(buddy) {
	return function(msg, encrypted) {
		// drop unencrypted messages
		if (encrypted) {
			Cryptocat.addToConversation(msg, buddy, buddy, 'message')
			if (Cryptocat.me.currentBuddy.name !== buddy) {
				Cryptocat.messagePreview(msg, buddy)
			}
		}
	}
}

// Handle outgoing messages.
Cryptocat.otr.onOutgoing = function(buddy) {
	return function(message) {
		Cryptocat.xmpp.connection.muc.message(
			Cryptocat.me.conversation + '@' + Cryptocat.xmpp.conferenceServer,
			buddy, message, null, 'chat', 'active'
		)
	}
}

// Receive an SMP question
Cryptocat.otr.onSMPQuestion = function(nickname, question) {
	$('#dialogBoxClose').click()
	var answer = false
	window.setTimeout(function(nickname) {
		Cryptocat.dialogBox(Mustache.render(Cryptocat.templates.authRequest, {
			authenticate: Cryptocat.locale['chatWindow']['authenticate'],
			authRequest: Cryptocat.locale['chatWindow']['authRequest']
				.replace('(NICKNAME)', nickname),
			answerMustMatch: Cryptocat.locale['chatWindow']['answerMustMatch']
				.replace('(NICKNAME)', nickname),
			question: question,
			answer: Cryptocat.locale['chatWindow']['answer']
		}), 240, true, function() {
			$('#authReplySubmit').unbind('click').bind('click', function(e) {
				e.preventDefault()
				answer = $('#authReply').val().toLowerCase()
					.replace(/(\s|\.|\,|\'|\"|\;|\?|\!)/, '')
				Cryptocat.buddies[nickname].otrKey.smpSecret(answer)
				$('#dialogBoxClose').click()
			})
		}, function() {
			if (!answer) {
				Cryptocat.buddies[nickname].otrKey.smpSecret(
					Cryptocat.random.encodedBytes(16, CryptoJS.enc.Hex)
				)
			}
		})
	}, 500, nickname)
}

// Add a new OTR key for a new conversation participant
Cryptocat.otr.add = function(buddy) {
	Cryptocat.buddies[buddy].otrKey = new OTR({
		priv: Cryptocat.me.otrKey,
		smw: {
			path: 'js/workers/smp.js',
			seed: Cryptocat.random.generateSeed
		}
	})
	Cryptocat.buddies[buddy].otrKey.REQUIRE_ENCRYPTION = true
	Cryptocat.buddies[buddy].otrKey.on('ui' , Cryptocat.otr.onIncoming(buddy))
	Cryptocat.buddies[buddy].otrKey.on('io' , Cryptocat.otr.onOutgoing(buddy))
	Cryptocat.buddies[buddy].otrKey.on('smp', Cryptocat.otr.onSMPAnswer(buddy))
	Cryptocat.buddies[buddy].otrKey.on('status', (function(buddy) {
		return function(state) {
			if (Cryptocat.buddies[buddy].otrKey.genFingerCb
			&& state === OTR.CONST.STATUS_AKE_SUCCESS) {
				Cryptocat.closeGenerateFingerprints(buddy, Cryptocat.buddies[buddy].otrKey.genFingerCb)
				;delete Cryptocat.buddies[buddy].otrKey.genFingerCb
				Cryptocat.buddies[buddy].authenticated = false
			}
		}
	} (buddy)))
	Cryptocat.buddies[buddy].otrKey.on('file', (function (buddy) {
		return function(type, key, filename) {
			key = CryptoJS.SHA512(CryptoJS.enc.Latin1.parse(key))
			key = key.toString(CryptoJS.enc.Latin1)
			if (!Cryptocat.buddies[buddy].fileKey) {
				Cryptocat.buddies[buddy].fileKey = {}
			}
			Cryptocat.buddies[buddy].fileKey[filename] = [
				key.substring(0, 32), key.substring(32)
			]
		}
	}) (buddy))
}

// Handle SMP callback
Cryptocat.otr.onSMPAnswer = function(nickname) {
	return function(type, data, act) {
		if (type === 'question') {
			Cryptocat.otr.onSMPQuestion(nickname, data)
		}
		if ((type === 'trust') && (act === 'asked')) {
			if (data) {
				Cryptocat.buddies[nickname].authenticated = true
				if ($('#authInfo').length) {
					Cryptocat.showAuthenticated(nickname, 200)
					window.setTimeout(function() {
						$('#dialogBox').animate({'height': 250})
					}, 200)
				}
			}
			else if ($('#authInfo').length) {
				$('#authSubmit').val(Cryptocat.locale['chatWindow']['failed'])
					.animate({'background-color': '#F00'})
			}
		}
		if (type === 'abort') {
			$('#authSubmit').val(Cryptocat.locale['chatWindow']['failed'])
				.animate({'background-color': '#F00'})
		}
	}
}
