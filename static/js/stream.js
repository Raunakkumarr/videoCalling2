'use strict';

const baseUrl = "/"

let localVideo = document.querySelector('#localVideo');
let remoteVideo = document.querySelector('#remoteVideo');

let otherUSer;
let remoteRTCMessage;
let iceCandidatesFromCaller = [];
let peerConnection;
let remoteStream;
let localStream;

let callInProgress = false;

function call() {
    let userToCall = document.getElementById('callName').ariaValueMax;
    otherUSer = userToCall;
    
    beReady().then(bool => {
        processCall(userToCall);
    });
}

function answer() {
    beReady().then(bool => {
        processAccept();
    });
}

let pcConfig = {
    "iceServers": [
        { "url": "stun:stun.jap.bloggernepal.com:5349" },
        {
            "url": "turn:turn.jap.bloggernepal.com:5349",
            "username": "guest",
            "credential": "somepassword"
        },
        { "url": "stun:stun.1.google.com:19302" }
    ]
};

let sdpConstraints = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
};

let socket;
let callSocket;

function connectSocket(myName){
    let ws_scheme = window.location.protocol == "https:" ? "wss://" : "ws://";

    callSocket = new WebSocket(
        ws_scheme
        + window.location.host
        + 'ws/call/'
    );
    
    callSocket.onopen = event => {
        callSocket.send(JSON.stringify({
            type:'login',
            data:{
                name: myName
            }
        }));
    }

    callSocket.onmessage = (e) => {
        let response = JSON.parse(e.data);
        let type = response.type;
        if (type == 'connection'){
            console.log(response.data.message);
        }
        if (type == 'call_received'){
            onNewCall(response.data);
        }
        if (type == 'call_answered'){
            onCallAnswered(response.data);
        }
        if (type == 'ICEcandidate'){
            onICECandidate(response.data);
        }

    }

    const onNewCall = (data) => {
        otherUSer = data.caller;
        remoteRTCMessage = data.rtcMessage;

        document.getElementById('callerName').innerHTML = otherUSer;
        document.getElementById('call').style.display = "none";
        document.getElementById('answer').style.display = 'block';
    }

    const onCallAnswered = (data) => {
        remoteRTCMessage = data.rtcMessage;
        peerConnection.setRemoteDescription(new RTCSessionDescription(remoteRTCMessage));

        document.getElementById('calling').style.display="none";

        console.log("Call Started. They Answered!");

        callProgress();
    }

    const onICECandidate = (data) => {
        console.log("Got ICE Candidate");

        let message = data.rtcMessage;
        let candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });

        if (peerConnection){
            console.log("ICE Candidate Added");
            peerConnection.addIceCandidate(candidate);
        }else{
            console.log("ICE Candidate Pushed");
            iceCandidatesFromCaller.push(candidate);
        }
    }
}

/**
 * @param {Object} data
 * @param {number} data.name - the name of the useer to call
 * @param {Object} data.rtcMessage - answer rec sessionDescription object
*/


function sendCall(data) {
    console.log("Send Call");
    callSocket.send(JSON.stringify({
        type: 'call',
        data
    }));

    document.getElementById('call').style.display="none";
    document.getElementById('otherUserNameCA').innerHTML=otherUSer;
    document.getElementById("calling").style.display="block";
}

/**
 * 
 * @param {Object} data
 * @param {number} data.caller
 * @param {Object} data.rtcMessage
*/

function answerCall(data){
    callSocket.send(JSON.stringify({
        type:'answer_call',
        data
    }));
    callProgress();
}

/**
 * @param {Object} data
 * @param {number} data.user
 * @param {Object} data.rtcMessage
*/

function sendICEcandidate(data){
    console.log('Send ICE Candidate');
    callSocket.send(JSON.stringify({
        type:'ICEcandidate',
        data
    }));
}

function beReady(){
    return navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
    }).then(stream => {
        localStream = stream;
        localVideo.srcObject = stream;

        return createConnectionAndAddStream();
    }).catch(function(e){
        alert('getUserMedia() error: '+e.name);
    });
}

function createConnectionAndAddStream(){
    createPeerConnection();
    peerConnection.addStream(localStream);
    return true;
}

function processCall(userName){
    peerConnection.createOffer((sessionDescription) =>{
        peerConnection.setLocalDescription(sessionDescription);
        sendCall({
            name: userName,
            rtcMessage: sessionDescription
        }, (error) => {
            console.log("Error");
        });

    });
}

function processAccept(){
    peerConnection.setRemoteDescription(new RTCSessionDescription(remoteRTCMessage));
    peerConnection.createAnswer((sessionDescription) => {
        peerConnection.setLocalDescription(sessionDescription);

        if (iceCandidatesFromCaller.length > 0){
            for (let i=0; i< iceCandidatesFromCaller.length; i++){
                let candidate = iceCandidatesFromCaller[i];
                console.log("ICE candidate added from queue");
                try{
                    peerConnection.addIceCandidate(candidate).then(done => {
                        console.log(done);
                    }).catch(error => {
                        console.log(error);
                    });
                }catch (error){
                    console.log(error);
                }
            }
            iceCandidatesFromCaller = [];
            console.log("ICE Candidate queue cleared.");
        } else {
            console.log("No Ice Candidate in queue.");
        }

        answerCall({
            caller: otherUSer,
            rtcMessage: sessionDescription
        });
    }, (error) => {
        console.log("Error");
    });
}

function createPeerConnection(){
    try{
        peerConnection = new RTCPeerConnection(pcConfig);
        peerConnection.onicecandidate = handleIceCandidate;
        peerConnection.onaddstream = handleRemoteStreamAdded;
        peerConnection.onremovestream = handleRemoteStreamRemoved;
        console.log('Create RTCPeerConnection');
        return;
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: '+e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
    }
}

function handleIceCandidate(event) {
    if (event.candidate){
        console.log("Local ICE Candidate");
        sendICEcandidate({
            user: otherUSer,
            rtcMessage: {
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            }
        });
    } else {
        console.log('End of Candidates.');
    }
}

function handleRemoteStreamAdded(event) {
    console.log('Remote Stream Added!');
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote Stream removed. Event: ',event);
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
}

window.onbeforeunload = function(){
    if (callInProgress) {
        stop();
    }
}

function stop(){
    localStream.getTracks().forEach(track => track.stop());
    callInProgress=false;
    peerConnection.close();
    peerConnection = null;
    document.getElementById('call').style.display="block";
    document.getElementById('answer').style.display="none";
    document.getElementById('inCall').style.display="none";
    document.getElementById('calling').style.display="none";
    document.getElementById('endVideoButton').style.display="none";
    otherUSer=null;
}

function callProgress(){
    document.getElementById('videos').style.display="block";
    document.getElementById('otherUserNameC').innerHTML=otherUSer;
    document.getElementById('inCall').style.display="block";

    callInProgress = true;
}