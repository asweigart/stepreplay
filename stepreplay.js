/*
CURRENT BUGS:

Hitting any key in the text field causes it to turn red.
The padding/truncating of steps when altering the bookmarks data isn't working.
    Also causes the steps select list to display "undefined" and not be selectable.
*/

// "StepReplay" by Al Sweigart (c) 2010
// Version 0.1

// http://coffeeghost.net
// This is a JavaScript application to display YouTube videos using the YouTube player API
// StepReplay gives the ability to step "steps" in the video timeline, and cause the
// player to pause when it reaches the next step. The user then has the option to replay
// the previous step.

// * Copyright (c) 2010, Al Sweigart
// * All rights reserved.
// *
// * Redistribution and use in source and binary forms, with or without
// * modification, are permitted provided that the following conditions are met:
// *     * Redistributions of source code must retain the above copyright
// *       notice, this list of conditions and the following disclaimer.
// *     * Redistributions in binary form must reproduce the above copyright
// *       notice, this list of conditions and the following disclaimer in the
// *       documentation and/or other materials provided with the distribution.
// *     * Neither the name of the PyBat nor the
// *       names of its contributors may be used to endorse or promote products
// *       derived from this software without specific prior written permission.
// *
// * THIS SOFTWARE IS PROVIDED BY Al Sweigart ``AS IS'' AND ANY
// * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// * DISCLAIMED. IN NO EVENT SHALL Al Sweigart BE LIABLE FOR ANY
// * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


// IMPORTANT NOTE: StepReplay requires the swfobject.js file from http://code.google.com/p/swfobject/

/*
Your html file should have the following elements: (where "foobar" is the "name " parameter to the StepReplay constructor.
<select id="foobar_videoSelect">
<select id="foobar_stepsSelect">
<div id="foobar_titleDiv">
<div id="foobar_ytPlayerDiv">
<div id="foobar_currentStepTextDiv">
<div id="foobar_stepCountdownDiv">
<input id="foobar_playPauseButton" type="button" />
<input id="foobar_pauseOnNewStep" type="checkbox" />
<input id="foobar_loopCurrentStep" type="checkbox" />
*/

var ENDED_STATE = 0;
var PLAYING_STATE = 1;
var PAUSED_STATE = 2;
var BUFFERING_STATE = 3;
var CUED_STATE = 5;

function prettyTime(seconds) {
    var hours = 0;
    var minutes = 0;
    seconds = parseInt(seconds, 10);
    if (seconds > 3600) {
        hours = Math.floor(seconds / 3600);
        seconds -= hours * 3600;
    }
    if (seconds > 60) {
        minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;
    }
    if (hours < 10) {
        hours = '0' + hours;
    }
    if (minutes < 10) {
        minutes = '0' + minutes;
    }
    if (seconds < 10) {
        seconds = '0' + seconds;
    }

    if (hours != '00') {
        return hours + ':' + minutes + ':' + seconds;
    }
    else {
        return minutes + ':' + seconds;
    }
}

function unprettyTime(prettyTime) {
    var timeParts = prettyTime.split(':');
    var result = null;
    if (timeParts.length == 3) {
        // h:m:s format:
        result = parseFloat(timeParts[0]) * 3600 + parseFloat(timeParts[1]) * 60 + parseFloat(timeParts[2]);
    }
    else if (timeParts.length == 2) {
        // m:s format:
        result = parseFloat(timeParts[0]) * 60 + parseFloat(timeParts[1]);
    }
    else if (timeParts.length == 1) {
        // just the seconds
        result = parseFloat(timeParts[0]);
    }
    return parseFloat(result.toFixed(2));
}

function markChanged(el, event) {
    if (event && (event.keyCode != 8 && event.keyCode != 32 && event.keyCode < 46)) {
        return; // only mark as changed for printable character keystrokes
    }
    if (typeof el == 'string') {
        el = document.getElementById(el);
    }
    if (el) {
        el.style.backgroundColor = '#FFEEEE';
    }
}

function markUnchanged(el) {
    if (typeof el == 'string') {
        el = document.getElementById(el);
    }
    if (el) {
        el.style.backgroundColor = '#FFFFFF';
    }
}

function markIfChanged(el, setValue) {
    if (!el) { return; }
    if (typeof el == 'string') {
        el = document.getElementById(el);
    }
    if (el.value == setValue + '') {
        markUnchanged(el);
    }
    else {
        markChanged(el);
    }
}

function StepReplay(name, videos, width, height, debugMode) {
    this.name = name;
    this.videosData = videos;
    this.debugMode = debugMode;

    // expand the desc array with blank step descriptions, if needed
    for (var i = 0; i < this.videosData.length; i++) {
        if (this.videosData[i].desc === undefined) {
            this.videosData[i].desc = [];
        }
        if (this.videosData[i].desc.length < this.videosData[i].bookmarks.length) {
            var numOfDescToAdd = (this.videosData[i].bookmarks.length - this.videosData[i].desc.length);
            for (var k = 0; k < numOfDescToAdd; k++) {
                this.videosData[i].desc.push('');
            }
        }
    }

    this.justInsertedStep = false;

    this.ytPlayer = null;
    if (this.videosData.length === 0) {
        alert('StepReplay Error: No videos loaded!');
        return;
    }
    this.curVid = this.videosData[0];

    this.ytPlayerDiv = this.name + '_ytPlayerDiv';
    this.videoSelect = this.name + '_videoSelect';
    this.stepsSelect = this.name + '_stepsSelect';
    this.stepCountdownDiv = this.name + '_stepCountdownDiv';
    this.pauseOnNewStepCheckbox = this.name + '_pauseOnNewStep';
    this.loopCurrentStepCheckbox = this.name + '_loopCurrentStep';
    this.playPauseButtonId = this.name + '_playPauseButton';

    this.playerState = CUED_STATE;

    this.pauseOnNewStep = false;
    var pauseCheckbox = document.getElementById(this.pauseOnNewStepCheckbox);
    if (pauseCheckbox) {
        this.pauseOnNewStep = pauseCheckbox.checked; // if true, play up to the beginning of the next step and then pause.
    }

    this.loopCurrentStep = false;
    var loopCheckbox = document.getElementById(this.loopCurrentStepCheckbox);
    if (loopCheckbox) {
        this.loopCurrentStep = loopCheckbox.checked; // if true, replay the current step over and over again.
    }

    this.width = width;
    this.height = height;
    this.displayVideoSize();

    this.populateRawVideoOrder();

    this.loadVideoSelectList();
    this.loadPlayer();
}

StepReplay.prototype.displayVideoSize = function() {
    var vidWidthText = document.getElementById(this.name + '_videoWidth');
    if (vidWidthText) {
        vidWidthText.value = this.width;
    }
    var vidHeightText = document.getElementById(this.name + '_videoHeight');
    if (vidHeightText) {
        vidHeightText.value = this.height;
    }
};

StepReplay.prototype.setVideoSize = function(width, height) {
    this.width = width;
    this.height = height;

    var vidObjEl = document.getElementById(this.name);
    if (vidObjEl) {
        vidObjEl.width = width;
        vidObjEl.height = height;
    }
    this.displayVideoSize();

    markUnchanged(this.name + '_videoWidth');
    markUnchanged(this.name + '_videoHeight');
    this.populateRawCodeField();
};

StepReplay.prototype.loadVideoSelectList = function() {
    // load videos into select box
    var selectBox = document.getElementById(this.videoSelect);
    if (!selectBox) {
        return;
    }

    selectBox.options.length = 0;
    for (var i = 0; i < this.videosData.length; i++) {
        selectBox.options[selectBox.options.length] = new Option(this.videosData[i].title, this.videosData[i].id, i === 0, false);
    }
};

StepReplay.prototype.onPlayerError = function(errorCode) {
    if (this.debugMode) {
        console.error('StepReplay Error: ' + errorCode);
    }
    else {
        alert('StepReplay Error: ' + errorCode);
    }
};

StepReplay.prototype.debugMsg = function(s) {
    try {
        if (this.debugMode) {
            console.debug(s); // Firefox with Firebug only.
        }
    }
    catch (err) {}
};

StepReplay.prototype.onPlayerStateChange = function(newState) {
    this.debugMsg('onPlayerStateChange(), newState = ' + newState);
    this.playerState = newState;
};

StepReplay.prototype.onYouTubePlayerReady = function() {
    this.debugMsg('onYouTubePlayerReady() called.');
    this.ytPlayer = document.getElementById(this.name);

    var myself = this;
    function callStateChange(newState) {
        this.debugMsg('callStateChange');
        myself.onPlayerStateChange(newState);
    }
    function callPlayerError(errorCode) {
        this.debugMsg('callPlayerError');
        myself.onPlayerError(errorCode);
    }

    this.loadVideo(this.videosData[0].id, true);

    // silly hack for setInterval:
    function callMethod() {
        myself.updatePlayerInfo();
    }
    setInterval(callMethod, 250);

    this.updatePlayerInfo();
};

StepReplay.prototype.loadPlayer = function() {
    if (!document.getElementById(this.ytPlayerDiv)) {
        alert('Error: Required <div> with id "' + this.ytPlayerDiv + '" not found!');
        return;
    }
    this.debugMsg('loadPlayer() called');
    // Lets Flash from another domain call JavaScript
    var params = { allowScriptAccess: "always" };
    // The element id of the Flash embed
    var atts = { id: this.name };
    // All of the magic handled by SWFObject (http://code.google.com/p/swfobject/)
    swfobject.embedSWF("http://www.youtube.com/v/" + this.curVid.id + "&enablejsapi=1&autoplay=0&playerapiid=player1",
                       this.ytPlayerDiv, this.width, this.height, "8", null, null, params, atts);
};

StepReplay.prototype.getCurrentStep = function() {
    if (this.ytPlayer.getCurrentTime() <= 0) {
        return 1;
    }
    for (var i = 0; i < this.curVid.bookmarks.length; i++) {
        if (this.curVid.bookmarks[i] >= this.ytPlayer.getCurrentTime()) {
            return i;
        }
    }
    return this.curVid.bookmarks.length;
};

StepReplay.prototype.seekToStep = function(stepNum) {
    this.ytPlayer.seekTo(this.curVid.bookmarks[stepNum - 1], false);
    this.displayCurrentSeekDisplay();
};

StepReplay.prototype.seekToTime = function(time) {
    var timeSeconds = 0;
    if (!this.ytPlayer) {
        return;
    }
    if (typeof(time) == 'number') {
        timeSeconds = parseFloat(time);
    }
    else if (/:/.test(time)) {
        // time is not in seconds, so unprettify it
        timeSeconds = unprettyTime(timeSeconds);
    }

    if (timeSeconds < 0) {
        timeSeconds = 0;
    }

    this.startOfStep = false;
    this.ytPlayer.seekTo(timeSeconds);
    this.displayCurrentSeekDisplay();
};

StepReplay.prototype.displayCurrentSeekDisplay = function() {
    var seekDisplay = document.getElementById(this.name + '_currentSeek');
    if (seekDisplay && this.ytPlayer) {
        seekDisplay.innerHTML = prettyTime(this.ytPlayer.getCurrentTime().toFixed(2));
    }
};

StepReplay.prototype.seekForward = function(time) {
    if (!this.ytPlayer) {
        return;
    }
    this.debugMsg('Jumping from ' + prettyTime(this.ytPlayer.getCurrentTime()) + ' to ' + this.ytPlayer.getCurrentTime() + time);

    time = parseFloat(time);
    this.seekToTime(this.ytPlayer.getCurrentTime() + time);

    this.debugMsg('Now at ' + prettyTime(this.ytPlayer.getCurrentTime()));
};

StepReplay.prototype.seekBack = function(time) {
    if (!this.ytPlayer) {
        return;
    }
    this.debugMsg('Jumping from ' + prettyTime(this.ytPlayer.getCurrentTime()) + ' to ' + this.ytPlayer.getCurrentTime() + time);

    time = parseFloat(time);
    this.seekToTime(this.ytPlayer.getCurrentTime() - time);
    this.debugMsg('Now at ' + prettyTime(this.ytPlayer.getCurrentTime()));
};

// Loads the selected video into the player.
StepReplay.prototype.loadVideo = function(videoId) {
    this.debugMsg('loadVideo() called for id ' + videoId);

    // set the current video variable (curVid)
    for (var j = 0; j < this.videosData.length; j++) {
        if (videoId == this.videosData[j].id) {
            this.curVid = this.videosData[j];
            break;
        }
    }

    this.displayTitle();

    // set the new bookmarks and desc data
    if (this.curVid.bookmarks.length === 0) {
        this.curVid.bookmarks = [0];
    }

    this.startOfVid = true;
    this.startOfStep = true;

    this.populateStepList();
    this.highlightStep(1);
    this.displayStepDesc(1);

    if (this.ytPlayer) {
      this.ytPlayer.loadVideoById(videoId);
      this.ytPlayer.pauseVideo(); // pauses when the video first loads. Take this out?
      //this.jumpToStep(1, false); // THIS LINE CAUSES THE CODE 100 ERROR FOR SOME REASON.
    }

    this.setVideoSelect(this.curVid.id);

    this.populateRawBookmarksField();
    this.populateRawStepDescField();
    this.populateRawCodeField();
};

StepReplay.prototype.setVideoSelect = function(value) {
    var selectBox = document.getElementById(this.videoSelect);
    if (selectBox) {
        selectBox.value = value;
    }
};

StepReplay.prototype.displayTitle = function() {
    var titleDiv = document.getElementById(this.name + '_titleDiv');
    if (titleDiv) {
        titleDiv.innerHTML = this.curVid.title;
    }
    var newTitleEditField = document.getElementById(this.name + '_newTitleEdit');
    if (newTitleEditField) {
        newTitleEditField.value = this.curVid.title;
    }
};

StepReplay.prototype.populateStepList = function() {
    // load steps into step select box
    var stepsSelectBox = document.getElementById(this.name + '_stepsSelect');
    stepsSelectBox.length = 0;
    if (stepsSelectBox) {
        for (var i = 0; i < this.curVid.bookmarks.length; i++) {
            if (this.curVid.desc[i] !== '') {
                stepsSelectBox.options[stepsSelectBox.options.length] = new Option(((i+1) + ': ') + this.curVid.desc[i], ((i+1) + ''), i === 0, false);
            }
            else {
                stepsSelectBox.options[stepsSelectBox.options.length] = new Option(((i+1) + ''), ((i+1) + ''), i === 0, false);
            }
        }
    }
};

StepReplay.prototype.highlightStep = function(stepNum) {
    // highlight the correct step
    var stepsSelectBox = document.getElementById(this.stepsSelect);
    if (!stepsSelectBox) {
        return;
    }

    if (stepsSelectBox.value != (stepNum + '')) {
        stepsSelectBox.value = (stepNum + '');
    }
};

StepReplay.prototype.getStepDesc = function(stepNum) {
    return this.curVid.desc[stepNum-1];
};

StepReplay.prototype.displayStepDesc = function(stepNum) {
    var stepDiv = document.getElementById(this.name + '_currentStepTextDiv');
    if (!stepDiv) {
        return;
    }
    // update step and description
    if (this.getStepDesc(stepNum) !== '') {
        stepDiv.innerHTML = 'Step ' + stepNum + ': ' + this.getStepDesc(stepNum);
    }
    else {
        stepDiv.innerHTML = 'Step ' + stepNum;
    }
};

StepReplay.prototype.populateStepDesc = function() {
    var stepNum = this.getCurrentStep();
    var stepEditField = document.getElementById(this.name + '_newStepEdit');
    if (!stepEditField) {
        return;
    }

    if (this.curStep-1 < this.curVid.desc.length) {
        stepEditField.value = this.getStepDesc(stepNum);
    }
};

StepReplay.prototype.jumpToStep = function(stepNum, startPlaying) {
    this.debugMsg('Jumping to step ' + stepNum + ' at time ' + this.curVid.bookmarks[stepNum-1]);
    if (stepNum == 1) {
        this.startOfVid = true;
    }
    this.curStep = stepNum;
    this.startOfStep = true;
    this.ytPlayer.seekTo(this.curVid.bookmarks[stepNum-1]);
    this.displayStepDesc(stepNum);
    if (startPlaying) {
        this.play();
    }
    this.displayCurrentSeekDisplay();
    this.highlightStep(stepNum);
};

StepReplay.prototype.play = function() {
    this.ytPlayer.playVideo();
};

StepReplay.prototype.replayStep = function() {
    if (this.startOfStep) {
        // seek to previous step and start playing
        this.previousStep(true);
    }
    else {
        // seek to start of current step and start playing
        this.jumpToStep(this.curStep, true);
    }
};

StepReplay.prototype.previousStep = function(startPlaying) {
    if (startPlaying === undefined) {
        startPlaying = false;
    }
    if (this.curStep > 1) {
        this.jumpToStep(this.curStep-1, startPlaying);
    }
    else if (this.curStep == 1) {
        this.jumpToStep(0, startPlaying);
    }
};

StepReplay.prototype.nextStep = function(startPlaying) {
    if (startPlaying === undefined) {
        startPlaying = false;
    }
    if (this.curStep < this.curVid.bookmarks.length) {
        this.jumpToStep(this.curStep+1, startPlaying);
    }
    else if (this.curStep == this.curVid.bookmarks.length) {
        // if at the last step and user clicks next step, do nothing.
    }
};

// Display information about the current state of the player
StepReplay.prototype.updatePlayerInfo = function() {
    // Also check that at least one function exists since when IE unloads the
    // page, it will destroy the SWF before clearing the interval.
    //this.debugMsg('updatePlayerInfo curStep = ' + this.curStep + ' getCurrentStep() = ' + this.getCurrentStep());

    if (this.ytPlayer && this.ytPlayer.getDuration) {
        // Temp hack, since addEventListener doesn't seem to work.
        this.playerState = this.ytPlayer.getPlayerState();

        if (this.curStep != this.getCurrentStep() && !this.justInsertedStep) {
            // entering a new step
            this.curStep = this.getCurrentStep();
            //this.debugMsg('Starting new step ' + this.curStep);
            this.startOfStep = true;

            if (this.loopCurrentStep && !this.hasLooped) {
                //this.debugMsg('Looping back to step ' + (this.curStep-1));
                this.hasLooped = true;
                this.previousStep();
            }
            else if (this.hasLooped) {
                //this.debugMsg('Setting hasLooped to false');
                this.hasLooped = false;
            }
            else if (this.pauseOnNewStep) {
                //this.debugMsg('Pausing on new step');
                this.ytPlayer.pauseVideo();
            }
            this.populateStepDesc();
            this.highlightStep(this.curStep);
        }
        else {
            this.justInsertedStep = false;
            if (this.startOfStep === true && this.ytPlayer.getPlayerState() === PLAYING_STATE) {
                this.startOfStep = false;
            }
            if (this.startOfVid === true && this.ytPlayer.getPlayerState() === PLAYING_STATE) {
                this.startOfVid = false;
            }
        }

        this.curStep = this.getCurrentStep();
        this.displayStepDesc(this.curStep);
        this.displayCountdown();

        // update the play button
        var playPauseButton = document.getElementById(this.playPauseButtonId);
        if (playPauseButton && this.playerState != PLAYING_STATE) {
            // if the video is not playing, then set the button to say Play
            playPauseButton.value = 'Play';
        }
        else if (playPauseButton && this.playerState == PLAYING_STATE) {
            // if the video is player, then set the button to say Pause
            playPauseButton.value = 'Pause';
        }
        //updateHTML("videoDuration", this.ytPlayer.getDuration());
        //updateHTML("videoCurrentTime", this.ytPlayer.getCurrentTime());
        //updateHTML("bytesTotal", this.ytPlayer.getVideoBytesTotal());
        //updateHTML("startBytes", this.ytPlayer.getVideoStartBytes());
        //updateHTML("bytesLoaded", this.ytPlayer.getVideoBytesLoaded());

        this.displayCurrentSeekDisplay();
    }
};

StepReplay.prototype.displayCountdown = function() {
    var countdownDiv = document.getElementById(this.stepCountdownDiv);
    if (countdownDiv) {
        if (this.curStep < this.curVid.bookmarks.length) {
            countdownDiv.innerHTML = prettyTime((this.curVid.bookmarks[this.curStep] - this.ytPlayer.getCurrentTime()).toFixed(0));
        }
        else {
            countdownDiv.innerHTML = '00:00';
        }
    }
};

StepReplay.prototype.playPause = function() {
    var playPauseButton = document.getElementById(this.playPauseButtonId);
    if (this.playerState == PLAYING_STATE) {
        this.ytPlayer.pauseVideo();
        playPauseButton.value = 'Pause';
    }
    else {
        this.ytPlayer.playVideo();
        playPauseButton.value = 'Play';
    }
};

StepReplay.prototype.insertStep = function() {
    if (!this.ytPlayer) {
        return;
    }

    var timeCode = parseFloat(this.ytPlayer.getCurrentTime().toFixed(2));

    for (var i = 0 ; i <= this.curVid.bookmarks.length; i++) {
        if (timeCode == this.curVid.bookmarks[i]) {
            // There is already a bookmark here, so this is a no-op.
            break;
        }
        else if (i == this.curVid.bookmarks.length) {
            // iterated through the entire bookmarks array without finding a smaller bookmark, so append the step to the end
            this.curVid.bookmarks.push(timeCode);
            this.curVid.desc.push('');
            break;
        }
        else if (timeCode < this.curVid.bookmarks[i]) {
            // insert a new bookmarks & blank step description.
            this.curVid.bookmarks.splice(i, 0, timeCode);
            this.curVid.desc.splice(i, 0, '');
            break;
        }
    }

    // update the data structures and UI
    this.curStep = this.getCurrentStep();
    this.displayCountdown();
    this.populateRawBookmarksField();
    this.populateStepList();
    this.justInsertedStep = true; // without setting this, the player will immediately halt because it is in a new step.
};

StepReplay.prototype.addNewVideo = function(url) {
    var id = url.match(/v=(\d|\w|_)+/);
    if (!id) {
        if (url === '') {
            alert('Please enter a YouTube URL address in the text field.');
        }
        else {
            alert(url + ' is not a valid YouTube URL.');
        }
        this.debugMsg(url + ' is not a valid YouTube URL.');
        return;
    }

    id = id[0].substr(2); // get rid of the "v="
    this.videosData.push({'id':id, 'title':'New Title', 'bookmarks':[0], 'desc':[]});
    this.loadVideoSelectList();
    this.loadVideo(id);
    this.populateRawVideoOrder();
    this.populateRawStepDescField();
};

StepReplay.prototype.editVideoTitle = function(newTitle) {
    this.curVid.title = newTitle;
    this.loadVideoSelectList();
    this.setVideoSelect(this.curVid.id);
    this.displayTitle();
    this.populateRawVideoOrder();
    this.populateRawStepDescField();
    markUnchanged(this.name + '_newTitleEdit');
};

StepReplay.prototype.editStepDesc = function(stepNum, newStepDesc) {
    this.curVid.desc[stepNum-1] = newStepDesc;
    this.populateStepList();
    this.displayStepDesc(stepNum);
    this.populateRawCodeField();
    this.populateRawVideoOrder();
    this.populateRawStepDescField();
    markUnchanged(this.name + '_newStepEdit');

    this.highlightStep(stepNum);
};


StepReplay.prototype.editBookmarks = function(rawBookmarksData) {
    rawBookmarksData = rawBookmarksData.replace(' ', '');
    rawBookmarksData = rawBookmarksData.split(',');

    for (var i = 0; i < rawBookmarksData.length; i++) {
        rawBookmarksData[i] = unprettyTime(rawBookmarksData[i]);
    }
    // add 0 as the first bookmark if it is not already there.
    if (rawBookmarksData[0] !== 0) {
        rawBookmarksData.splice(0, 0, 0);
    }
    this.curVid.bookmarks = rawBookmarksData;
    this.updatePlayerInfo();

    // Make sure number of step descriptions matches the number of bookmarks
    if (this.curVid.bookmarks.length > this.curVid.desc.length) {
        var numOfDescToAdd = (this.curVid.bookmarks.length - this.curVid.desc.length);
        for (i = 0; i < numOfDescToAdd; i++) {
            // pad with blanks
            this.curVid.desc.push('');
        }
    }
    else if (this.curVid.bookmarks.length < this.curVid.desc.length) {
        // truncate the desc array to the bookmarks array's length
        this.curVid.desc.slice(this.curVid.bookmarks.length, (this.curVid.desc.length - this.curVid.bookmarks.length));
    }

    this.populateRawCodeField();

    // update the steps fields since we may have modified the this.curVid.desc array.
    this.populateStepList();
    this.highlightStep(1);
    this.displayStepDesc(1);
    markUnchanged(this.name + '_rawBookmarksData');
};

StepReplay.prototype.populateRawBookmarksField = function() {
    var dataField = document.getElementById(this.name + '_rawBookmarksData');
    if (!dataField) {
        return;
    }
    var fieldtext = [];
    for (var i = 0; i < this.curVid.bookmarks.length; i++) {
        fieldtext.push(prettyTime(this.curVid.bookmarks[i]));
    }
    dataField.value = fieldtext.join(', ');
    markUnchanged(dataField);
};

StepReplay.prototype.editAllStepDesc = function(rawStepDescs) {
    var stepDescs = rawStepDescs.split('\n');

    // pad stepDescs if needed
    for (var i = 0; i < (this.curVid.desc.length - stepDescs.length); i++) {
        stepDescs.push('');
    }

    for (i = 0; i < stepDescs.length; i++) {
        if (stepDescs[i].substr(0, 11) == '<blank step') {
            this.curVid.desc[i] = '';
        }
        else {
            this.curVid.desc[i] = stepDescs[i];
        }
    }
    this.populateStepList();
    this.highlightStep(1);
    this.displayStepDesc(1);

    this.populateRawCodeField();
    this.populateRawStepDescField();
    markUnchanged(this.name + '_rawStepDescData');
};

StepReplay.prototype.populateRawStepDescField = function() {
    var dataField = document.getElementById(this.name + '_rawStepDescData');
    if (!dataField) {
        return;
    }
    var showSteps = [];
    for (var i = 0; i < this.curVid.desc.length; i++) {
        if (this.curVid.desc[i] === '') {
            showSteps.push('<blank step ' + (i+1) + ' description>');
        }
        else {
            showSteps.push(this.curVid.desc[i]);
        }
    }
    dataField.value = showSteps.join('\n');
    markUnchanged(dataField);
};

StepReplay.prototype.populateVideoListField = function() {
    var videoListField = document.getElementById(this.name + '_videoListField');
    if (!videoListField) {
        return;
    }

    var videoIdsAndTitles = [];
    for (var i = 0; i < this.videosData.length; i++) {
        videoIdsAndTitles.push(this.videosData[i].id + ',' + this.videosData[i].title);
    }
    videoListField.value = videoIdsAndTitles.join('\n');
    markUnchanged(videoListField);
};

StepReplay.prototype.videosDataAsString = function() {
    var result = [];
    var vidDatum = '';
    for (var i = 0; i < this.videosData.length; i++) {
        vidDatum = "{'id':'" + this.videosData[i].id + "', 'title':'" + this.videosData[i].title + "', 'bookmarks':[";
        var bookmarksBuf = [];
        for (var j = 0; j < this.videosData[i].bookmarks.length; j++) {
            bookmarksBuf.push(this.videosData[i].bookmarks[j]);
        }
        vidDatum += bookmarksBuf.join(', ') + ']';

        vidDatum += "', 'desc':[";
        var descBuf = [];
        // find where the blank strings at the end begin:
        for (var endDesc = this.videosData[i].desc.length; endDesc >= 0; endDesc--) {
            if (this.videosData[i].desc[endDesc] !== '' && this.videosData[i].desc[endDesc] !== undefined) {
                break;
            }
        }
        for (j = 0; j < endDesc; j++) {
            var descString = this.videosData[i].desc[j];
            descString = descString.replace("'", "\\x27").replace('"', "\\x22").replace("\\", "\\\\");
            descBuf.push("'" + descString + "'");
        }
        vidDatum += descBuf.join(', ') + ']';

        vidDatum += "}";

        result.push(vidDatum);
    }
    return '[' + result.join(",\n") + ']';
};

StepReplay.prototype.populateRawCodeField = function() {
    var rawCodeField = document.getElementById(this.name + '_rawCode');
    if (!rawCodeField) {
        return;
    }

    var objNameField = document.getElementById(this.name + '_stepReplayObjName');
    var name = '';
    var objName = '';
    if (!objNameField || objNameField.value === '') {
        name = 'sr';
        objName = 'srObj';
    }
    else {
        name = objNameField.value;
        objName = objNameField.value + 'Obj';
    }
    rawCodeField.value = "<script src=\"http://www.google.com/jsapi\" type=\"text/javascript\"></script>\n<script type=\"text/javascript\">\n  google.load(\"swfobject\", \"2.1\");\n</script>\n<script src=\"stepreplay.js\" type=\"text/javascript\"></script>\n<script type=\"text/javascript\">\n    function setupStepReplay() {\n        videos = " + this.videosDataAsString() + ";\n    " + objName + " = new StepReplay(\'" + name + "\', videos, " + this.width + ", " + this.height + ", false);\n    }\n    // This function is automatically called by the player once it loads\n    function onYouTubePlayerReady() {\n        " + objName + ".onYouTubePlayerReady();\n    }\n\n    google.setOnLoadCallback(setupStepReplay);\n</script>\n\n<div>\n<div style=\"text-align: right;\">\n<select id=\"" + name + "_videoSelect\" onchange=\"" + objName + ".loadVideo(this.value);\">\n</select>\n</div>\n\n<div id=\"" + name + "_titleDiv\">&nbsp;</div>\n\n<div>\n<div id=\"" + name + "_ytPlayerDiv\">Loading...</div>\n<div style=\"float: right;\">\n    Steps:<br />\n    <select id=\"" + name + "_stepsSelect\" size=\"16\" onclick=\'" + objName + ".jumpToStep(this.value, false)\'>\n    </select>\n</div>\n</div>\n\n<div>\n<div id=\"" + name + "_currentStepTextDiv\" class=\"currentStep\">&nbsp;</div>\n<div>Next step in <span id=\"" + name + "_stepCountdownDiv\">&nbsp;</span>.</div>\n</div>\n\n<div id=\"controlPanel\" style=\"text-align: center;\">\n    <input type=\"button\" value=\"Previous\" onclick=\"" + objName + ".previousStep()\"/>\n    <input type=\"button\" value=\"Replay Step\" onclick=\"" + objName + ".replayStep()\"/>\n    <input type=\"button\" value=\"Play\" onclick=\"" + objName + ".playPause()\" id=\"" + name + "_playPauseButton\" style=\"width: 60px;\" />\n    <input type=\"button\" value=\"Next\" onclick=\"" + objName + ".nextStep()\"/><br />\n\n    <input type=\"checkbox\" id=\"" + name + "_pauseOnNewStep\" checked onclick=\"" + objName + ".pauseOnNewStep = this.checked;\" /><label for=\"" + name + "_pauseOnNewStep\">Pause after new step.</label><br />\n    <input type=\"checkbox\" id=\"" + name + "_loopCurrentStep\" onclick=\"" + objName + ".loopCurrentStep = this.checked;\" /><label for=\"" + name + "_loopCurrentStep\">Loop the current step.</label><br />\n</div>\n\n<div style=\"height: 40px;\">&nbsp;</div>\n";
    markUnchanged(rawCodeField);
};

StepReplay.prototype.editVideoOrder = function() {
    var vidOrderField = document.getElementById(this.name + '_rawVideoOrder');
    if (!vidOrderField) {
        return;
    }

    var videosDataBuffer = [];
    var vidOrder = vidOrderField.value.split('\n');
    for (var i = 0; i < vidOrder.length; i++) {
        var parts = vidOrder[i].split(',');
        if (parts.length < 2) {
            continue;
        }
        var id = parts[0];
        for (var j = 0; j < this.videosData.length; j++) {
            if (id == this.videosData[j].id) {
                if (parts[1]) {
                    // update the title since it has changed.
                    this.videosData[j].title = parts[1];
                }
                videosDataBuffer.push(this.videosData[j]);
                break;
            }
        }
    }
    this.videosData = videosDataBuffer;
    this.loadVideoSelectList();
    this.setVideoSelect(this.curVid.id);

    this.populateRawCodeField();
    this.loadVideoSelectList();
    this.displayTitle();

    markUnchanged(vidOrderField);
};

StepReplay.prototype.populateRawVideoOrder = function() {
    var vidOrderField = document.getElementById(this.name + '_rawVideoOrder');
    if (!vidOrderField) {
        return;
    }

    var vidOrder = [];
    for (var i = 0; i < this.videosData.length; i++) {
        vidOrder.push(this.videosData[i].id + ',' + this.videosData[i].title);
    }
    vidOrderField.value = vidOrder.join('\n');

    markUnchanged(vidOrderField);
};
