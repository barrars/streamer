// Use the websocket-relay to serve a raw MPEG-TS over WebSockets. You can use
// ffmpeg to feed the relay. ffmpeg -> websocket-relay -> browser
// Example:
// node websocket-relay yoursecret 8081 8082
// ffmpeg -i <some input> -f mpegts http://localhost:8081/yoursecret
var cmd = require("node-cmd");

var fs = require("fs");
const { spawn, exec } = require('child_process');

var http = require("http");

var WebSocket = require("ws");
var express = require("express");
var app = express();
app.enable("trust proxy");

// if (process.argv.length < 3) {
//   console.log(
//     "Usage: \n" +
//       "node websocket-relay.js <secret> [<stream-port> <websocket-port>]"
//   );
//   process.exit();
// }

// var STREAM_SECRET = process.argv[2];
// var STREAM_SECRET = ;

var STREAM_PORT = process.argv[3] || 8181;

var WEBSOCKET_PORT = process.argv[4] || 8182;

var RECORD_STREAM = false;

var WEBCAM_PROCEES = null;

// Websocket Server
var socketServer = new WebSocket.Server({
  port: WEBSOCKET_PORT,
  perMessageDeflate: false
});
socketServer.connectionCount = 0;
socketServer.on("connection", function(socket, upgradeReq) {
  if (socketServer.connectionCount == 0 && !WEBCAM_PROCEES) {
    //Start the webcam process
    console.log("Starting webcam!!");
    const ffmpeg_command = `ffmpeg -f v4l2 -framerate 25 -video_size 640x480 -i /dev/video0 -f mpegts -codec:v mpeg1video -s 640x480 -b:v 1000k -bf 0 http://localhost:8181/supersecret`;
    WEBCAM_PROCEES = cmd.run(ffmpeg_command, cmd_callback);
    // const pid = WEBCAM_PROCEES.pid
    // console.log({WEBCAM_PROCEES_ID})
    // console.log({pid})
  }
  socketServer.connectionCount++;
  console.log(
    "New WebSocket Connection: ",
    (upgradeReq || socket.upgradeReq).socket.remoteAddress,
    (upgradeReq || socket.upgradeReq).headers["user-agent"],
    "(" + socketServer.connectionCount + " total)"
  );
  socket.on("close", function(code, message) {
    socketServer.connectionCount--;
    console.log(
      "Disconnected WebSocket (" + socketServer.connectionCount + " total)"
    );
    if (socketServer.connectionCount == 0) {
      console.log("Stop the webcam already");
      console.log(`Killing process ffmpeg`)

      let kill_cmd = cmd.run(`killall ffmpeg`, cmd_callback)
      // process.kill(WEBCAM_PROCEES_ID.pid, 'SIGINT')
      kill_cmd.on('close', ()=>{
        console.log('close')
      })
      WEBCAM_PROCEES = null
      // console.log({WEBCAM_PROCEES_ID})
      // console.log({kill_cmd})

    }
  });
});
socketServer.broadcast = function(data) {
  // console.log('Broadcasting')
  socketServer.clients.forEach(function(client) {
    // console.log(client)
    if (client.readyState === WebSocket.OPEN) {
      // console.log('sending Data')
      // console.log(data)
      client.send(data);
    }
  });
};

// HTTP Server to accept incomming MPEG-TS Stream from ffmpeg
// app
// .get("*", (request, response) => {
var streamServer = http
  .createServer(function(request, response) {
    console.log("TS????");
    var params = request.url.substr(1).split("/");
    console.log(params);

    // if (params[0] !== STREAM_SECRET) {
    //   console.log(
    //     "Failed Stream Connection: " +
    //       request.socket.remoteAddress +
    //       ":" +
    //       request.socket.remotePort +
    //       " - wrong secret."
    //   );
    //   response.end();
    // }

    response.connection.setTimeout(0);
    console.log(
      "Stream Connected: " +
        request.socket.remoteAddress +
        ":" +
        request.socket.remotePort
    );
    request.on("data", function(data) {
      // console.log('Got stream data')
      // console.log(data)
      socketServer.broadcast(data);
      if (request.socket.recording) {
        request.socket.recording.write(data);
      }
    });
    request.on("end", function() {
      console.log("close");
      if (request.socket.recording) {
        request.socket.recording.close();
      }
    });

    // Record the stream to a local file?
    if (RECORD_STREAM) {
      var path = "recordings/" + Date.now() + ".ts";
      request.socket.recording = fs.createWriteStream(path);
    }
  })
  .listen(STREAM_PORT);

console.log(
  "Listening for incomming MPEG-TS Stream on http://127.0.0.1:" +
    STREAM_PORT +
    "/<secret>"
);
console.log(
  "Awaiting WebSocket connections on ws://127.0.0.1:" + WEBSOCKET_PORT + "/"
);



//cmd process callback
cmd_callback = (err, data, strerr) => {
  console.log({
    err,
    data,
    strerr
  });
}