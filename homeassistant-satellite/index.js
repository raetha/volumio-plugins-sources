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
		// Server section
		const serverUIConf = uiconf.sections[0];
		const haHost = self.config.get('ha_host');
		const haToken = self.config.get('ha_token');
		const haProtocol = self.config.get('ha_protocol');
		const haProtocolOptions = serverUIConf.content[2].options;
		serverUIConf.content[0].value = haHost; 
		serverUIConf.content[1].value = haToken;
		serverUIConf.content[2].value = haProtocolOptions.find((option) => option.value === haProtocol);

		// Options section
		const optionsUIConf = uiconf.sections[1];
		const vadType = self.config.get('vad_type');
		const vadTypeOptions = optionsUIConf.content[0].options;
		optionsUIConf.content[0].value = vadTypeOptions.find((option) => option.value === vadType);

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

	var ha_host = self.config.get('ha_host', '');
	var ha_token = self.config.get('ha_token', '');
	var ha_protocol = self.config.get('ha_protocol', 'http');
	var vad_type = self.config.get('vad_type', 'webrtcvad');

	this.logger.info('Saving Home Assistant Satellite service file');

	serviceFile  = '[Unit]\n';
	serviceFile += 'Description=' + self.pluginPrettyName + '\n';
	serviceFile += 'Wants=network-online.target headless_pulseaudio.service\n';
	serviceFile += 'After=network-online.target headless_pulseaudio.service\n';
	serviceFile += '\n';
	serviceFile += '[Service]\n';
	serviceFile += 'Type=simple\n';
	serviceFile += 'StandardOutput=journal\n';
	serviceFile += 'StandardError=journal\n';
	serviceFile += 'SyslogIdentifier=' + self.pluginName + '\n';
	serviceFile += 'User=volumio\n';
	serviceFile += 'Group=volumio\n';
	serviceFile += 'ExecStart=' + exec_command;
	serviceFile += '\\\n' + ' --host ' + ha_host;
	serviceFile += '\\\n' + ' --token ' + ha_token;
	serviceFile += '\\\n' + ' --protocol ' + ha_protocol;
	serviceFile += '\\\n' + ' --awake-sound ' + awake_sound;
	serviceFile += '\\\n' + ' --done-sound ' + done_sound;
	serviceFile += '\\\n' + '# --mic-device pulse';
	serviceFile += '\\\n' + '# --snd-device pulse';
	serviceFile += '\\\n' + ' --vad ' + vad_type + '';
	serviceFile += '\\\n' + ' --noise-suppression 0';
	serviceFile += '\\\n' + ' --auto-gain 0';
	serviceFile += '\\\n' + ' --volume-multiplier 1.0';
	serviceFile += '\\\n' + '# --wake-word wyoming --wyoming-host <host> --wyoming-port <port> --wake-word-id <id>';
	serviceFile += '\\\n' + ' --pulseaudio --echo-cancel --ducking=0.2';
	serviceFile += '\n';
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
