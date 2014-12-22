/*jshint -W117*/

Components.utils.import('resource://gre/modules/Services.jsm')
Components.utils.import('resource://gre/modules/ctypes.jsm')
var prefsService = Services.prefs

var CryptocatFirefox = {}

CryptocatFirefox.init = function() {
	if (!Application.prefs.getValue('extensions.cryptocat.firstRunPref', false)) {
		Application.prefs.setValue('extensions.cryptocat.firstRunPref', true)
		var navBar = document.getElementById('nav-bar')
		var newSet = navBar.currentSet + ',cryptocatToolbarButton'
		navBar.currentSet = newSet
		navBar.setAttribute('currentset', newSet)
		document.persist('nav-bar', 'currentset')
		window.setTimeout(function() {
			gBrowser.selectedTab = gBrowser.addTab('chrome://cryptocat/content/data/firstRun.html')
		}, 1500)
	}
}

CryptocatFirefox.run = function() {
	gBrowser.selectedTab = gBrowser.addTab('chrome://cryptocat/content/data/index.html')
	window.addEventListener('cryptocatFirefoxStorage', function(evt) {
		var type = evt.target.getAttribute('type')
		if (type === 'set') {
			Application.prefs.setValue(
				'extensions.cryptocat.' + evt.target.getAttribute('key'),
				evt.target.getAttribute('val')
			)
		}
		if (type === 'get') {
			var get = prefsService.getCharPref(
				'extensions.cryptocat.' + evt.target.getAttribute('key')
			)
			if (get.length) {
				evt.target.setAttribute('firefoxStorageGet', get)
			}
		}
		if (type === 'remove') {
			Application.prefs.setValue(
				'extensions.cryptocat.' + evt.target.getAttribute('key'), ''
			)
		}
	}, false, true)
}

window.addEventListener('load', function() { CryptocatFirefox.init(); }, false)
