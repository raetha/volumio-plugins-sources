'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var config = new (require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;

// Additional requirements
var path = require('path');

module.exports = homeassistant_satellite;

function homeassistant_satellite(context) {
	var self = this;

	this.context = context;
	this.commandRouter = this.context.coreCommand;
	this.logger = this.context.logger;
	this.configManager = this.context.configManager;

	// Load values from package.json
	self.pluginName = self.commandRouter.pluginManager.getPackageJson(__dirname).name;
	self.pluginType = self.commandRouter.pluginManager.getPackageJson(__dirname).volumio_info.plugin_type;
	self.pluginPrettyName = self.commandRouter.pluginManager.getPackageJson(__dirname).volumio_info.prettyName;
	self.pluginPath = __dirname;
}

homeassistant_satellite.prototype.onVolumioStart = function ()
{
	var self = this;
	var configFile=this.commandRouter.pluginManager.getConfigurationFile(this.context,'config.json');
	this.config = new (require('v-conf'))();
	this.config.loadFile(configFile);

	return libQ.resolve();
}

homeassistant_satellite.prototype.onStart = function () {
	var self = this;
	var defer=libQ.defer();

	self.updateServiceFile();

	self.logger.info('Starting homeassistant_satellite service');
	self.systemctl('start homeassistant_satellite.service')
		.then(function () {
			defer.resolve();
		});

	return defer.promise;
};

homeassistant_satellite.prototype.onStop = function () {
	var self = this;
	var defer=libQ.defer();

	self.logger.info('Stopping homeassistant_satellite service');
	self.systemctl('stop homeassistant_satellite.service')
		.then(function () {
			defer.resolve();
		});

	return libQ.resolve();
};

homeassistant_satellite.prototype.onRestart = function () {
	var self = this;
	var defer = libQ.defer();

	self.updateServiceFile();

	self.logger.info('Restarting homeassistant_satellite service');
	self.systemctl('restart homeassistant_satellite.service')
		.then(function () {
			defer.resolve();
		});

	return defer.promise;
};


// Configuration Methods -----------------------------------------------------------------------------

homeassistant_satellite.prototype.getUIConfig = function () {
	var self = this;
	var defer = libQ.defer();

	var lang_code = this.commandRouter.sharedVars.get('language_code');

	self.commandRouter.i18nJson(__dirname+'/i18n/strings_'+lang_code+'.json',
		__dirname+'/i18n/strings_en.json',
		__dirname + '/UIConfig.json')
	.then(function(uiconf)
	{
		uiconf.sections[0].content[0].value = self.config.get('ha_host');
		uiconf.sections[0].content[1].value = self.config.get('ha_token');
		uiconf.sections[0].content[2].value.value = self.config.get('ha_protocol');
		uiconf.sections[1].content[0].value.value = self.config.get('vad_type');

		defer.resolve(uiconf);
	})
	.fail(function()
	{
		self.logger.error('Failed to parse UI Configuration page for plugin Home Assistant Satellite: ' + error);

		defer.reject(new Error());
	});

	return defer.promise;
};

homeassistant_satellite.prototype.getConfigurationFiles = function() {
	return ['config.json'];
};

homeassistant_satellite.prototype.setUIConfig = function (data) {
	var self = this;
	var defer = libQ.defer();

	self.logger.info('Saving Home Assistant Satellite configuration');

	for (var elementKey in data) {
		if (data[elementKey] !== undefined && data[elementKey].value !== undefined) {
			self.config.set(elementKey, data[elementKey].value);
		}
		else if (data[elementKey] !== undefined && data[elementKey].value == undefined) {
			self.config.set(elementKey, data[elementKey]);
		}
		else {
			self.logger.warn('Unable to save configuration for: ' + elementKey);
		}
	}

	self.onRestart();

	self.commandRouter.pushToastMessage('success', 'Home Assistant Satellite', 'Successfully saved configuration and restarted');

	return defer.promise;
};

homeassistant_satellite.prototype.getConf = function (varName) {
	var self = this;
	//Perform your installation tasks here
};

homeassistant_satellite.prototype.setConf = function (varName, varValue) {
	var self = this;
	//Perform your installation tasks here
};


// Configuration Functions --------------------------------------------------------------------------

homeassistant_satellite.prototype.updateServiceFile = function () {
	var self = this;
	var defer = libQ.defer();

	var baseDir = '/opt/' + self.pluginName + '/';
	var serviceFilePath = baseDir + self.pluginName + '.service';
	var serviceFile;
	var exec_command = baseDir + 'script/run';
	var awake_sound = baseDir + 'sounds/awake.wav';
	var done_sound = baseDir + 'sounds/done.wav';

	var alsa_card = self.commandRouter.executeOnPlugin('audio_interface', 'ControllerAlsa', 'getConfigParam', 'outputdevicecardname');

	var ha_host = self.config.get('ha_host', '');
	var ha_token = self.config.get('ha_token', '');
	var ha_protocol = self.config.get('ha_protocol', 'http');
	var vad_type = self.config.get('vad_type', 'webrtcvad');

	this.logger.info('Saving Home Assistant Satellite service file');

	serviceFile  = '[Unit]\n';
	serviceFile += 'Description=' + self.pluginPrettyName + '\n';
	serviceFile += 'Wants=network-online.target\n';
	serviceFile += 'After=network-online.target\n';
	serviceFile += '\n';
	serviceFile += '[Service]\n';
	serviceFile += 'Type=simple\n';
	serviceFile += 'StandardOutput=journal\n';
	serviceFile += 'StandardError=journal\n';
	serviceFile += 'SyslogIdentifier=' + self.pluginName + '\n';
	serviceFile += 'User=volumio\n';
	serviceFile += 'Group=volumio\n';
	serviceFile += 'ExecStart=' + exec_command + ' \\\n';
	serviceFile += ' --host ' + ha_host + ' \\\n';
	serviceFile += ' --token ' + ha_token + ' \\\n';
	serviceFile += ' --protocol ' + ha_protocol + ' \\\n';
	serviceFile += ' --vad ' + vad_type + ' \\\n';
	serviceFile += ' --awake-sound ' + awake_sound + ' \\\n';
	serviceFile += ' --done-sound ' + done_sound + ' \\\n';
	serviceFile += ' --noise-suppression 0 \\\n';
	serviceFile += ' --auto-gain 0 \\\n';
	serviceFile += ' --volume-multiplier 1.0 \n';
	serviceFile += '# --mic-device volumio \\\n';
	serviceFile += '# --snd-device volumio \n';
	serviceFile += '#--wake-word wyoming --wyoming-host <host> --wyoming-port <port> --wake-word-id <id>\n';
	serviceFile += '#--pulseaudio --echo-cancel --ducking=0.2\n';
	serviceFile += 'WorkingDirectory=' + baseDir + '\n';
	serviceFile += 'Restart=always\n';
	serviceFile += 'RestartSec=1\n';
	serviceFile += '\n';
	serviceFile += '[Install]\n';
	serviceFile += 'WantedBy=multi-user.target\n';

	fs.writeFile(serviceFilePath, serviceFile, (err) => {
		if (err) {
			defer.reject(err);
			this.logger.error('Failed to write Home Assistant Satellite service file: ' + err);
		} else {
			defer.resolve('');
			this.logger.info('Home Assistant Satellite service file written');
		}
	});

	self.systemctl('daemon-reload');

	return defer.promise;
}

homeassistant_satellite.prototype.systemctl = function (systemctlCmd) {
	var self = this;
	var defer = libQ.defer();

	exec('/usr/bin/sudo /bin/systemctl ' + systemctlCmd, { uid: 1000, gid: 1000 }, function (error, stdout, stderr) {
		if (error !== null) {
			self.commandRouter.pushConsoleMessage('Failed to ' + systemctlCmd + ': ' + error);
			self.commandRouter.pushToastMessage('error', 'systemctl failed', systemctlCmd + ' ' + ': ' + error);
			defer.reject(error);
		} else {
			self.commandRouter.pushConsoleMessage('Systemctl ' + systemctlCmd + ' succeeded.');
			defer.resolve();
		}
	});

	return defer.promise;
};
