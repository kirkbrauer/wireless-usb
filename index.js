const net = require('net');
const inquirer = require('inquirer');
const HID = require('node-hid');
const shortid = require('shortid');
const validateIP = require('validate-ip-node');
const ip = require('ip');

let devices = [];
let deviceOptions = [];
//Grab the HID device data
let rawDevices = HID.devices();

var id;

//Give each device a shortid
for (var i = 0; i < rawDevices.length; i++) {
  id = shortid.generate();
  deviceOptions.push({
    value: id,
    name: rawDevices[i].product
  });
  rawDevices[i].id = id;
}

//Ask the user all required questions
function options() {
  return inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "Choose a mode:",
      choices: [
        {
          value: "server",
          name: "Server"
        },
        {
          value: "client",
          name: "Client"
        }
      ]
    },
    {
      type: "input",
      name: "ip",
      message: "Server IP:",
      default: "127.0.0.1",
      validate: function (input) {
        //Only allow valid IP addresses
        return validateIP(input);
      },
      when: function (answers) {
        if (answers.mode === "client") return true;
        else return false;
      }
    },
    {
      type: "input",
      name: "port",
      message: "Server Port:",
      default: 5000,
      validate: function (input) {
        //Check for invalid numbers
        if (Number.isNaN(parseInt(input))) return false;
        else return true;
      },
      filter: function (input) {
        return parseInt(input);
      }
    },
    {
      type: "checkbox",
      name: "devices",
      message: "Choose devices to share:",
      choices: deviceOptions,
      when: function (answers) {
        if (answers.mode === "server") return true;
        else return false;
      }
    }
  ]).then((answers) => {
    //Pull out the raw devices based on selections
    if (answers.devices) {
      for (var i = 0; i < answers.devices.length; i++) {
        devices.push(rawDevices.filter(d => d.id === answers.devices[i])[0]);
      }
      answers.devices = devices;
    }
    return answers;
  });
}

options().then((opts) => {
  if (opts.mode === "server") {
    server(opts);
  } else {
    client(opts);
  }
});

function server(opts) {
  let clients = [];
  let openDevices = [];
  var openDevice;
  
  net.createServer((socket) => {
    
    //Give each socket a name for identification
    socket.name = socket.remoteAddress + ":" + socket.remotePort;

    clients.push(socket);

    console.log("Client connected: " + socket.name);

    //Write the initial buffer of device data
    socket.write(Buffer.from(JSON.stringify({
      type: 'devices',
      devices: rawDevices
    })));

    socket.on('end', () => {
      clients.splice(clients.indexOf(socket), 1);
      console.log(socket.name + " disconnected");
    });

  }).listen(opts.port);

  //Add listeners for each device
  opts.devices.forEach((device) => {
    //Create open device
    openDevice = new HID.HID(device.path);
    //Add device to array of all devices
    openDevices.push(openDevice);
    //When data is recieved, relay it to all clients
    openDevice.on("data", (buffer) => {
      for (var i = 0; i < clients.length; i++) {
        //Combine metadata and data buffer together
        clients[i].write(Buffer.concat([Buffer.from(JSON.stringify({ type: 'data', id: device.id }) + ":::"), buffer]));
      }
    });
  });

  console.log("Server running @ " + ip.address() + ":" + opts.port);
}

function client(opts) {
  let socket = new net.Socket();

  socket.connect(opts.port, opts.ip, () => {
    console.log("Connected to server");
  });

  socket.on('data', (data) => {
    //Split the buffer data at the seperator between metadata and the real data
    var splitBuff = data.toString().split(":::");
    console.log(JSON.parse(splitBuff[0]));
    //Slice the metadata and seperator from the buffer for use
    if (splitBuff[1]) console.log(data.slice(Buffer.from(splitBuff[0]).length + 3, data.length));
  });

  socket.on('close', () => {
    console.log("Connection closed");
  });
}