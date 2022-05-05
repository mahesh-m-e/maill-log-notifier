const notifier = require('mail-notifier');
const Imap = require('node-imap');
const MailParser = require("mailparser").MailParser;
const fs = require('fs');
const path = require('path');
const AsyncFs = fs.promises;

// user config...
const config = {
    /**
     * IMPORTANT NOTE:
     *  TO test in local did not configure the security certificates...
     *  The application will be considered as self signed certificate...
     *  The mail which you are using should be allow some configurations to read the mails...
     *  For Gmail account follow either of the :
     *      1. Enable IMAP in your Gmail account settings => https://support.google.com/mail/answer/7126229?hl=en.
     *      2. Authorize "less secure apps" => https://support.google.com/accounts/answer/6010255?hl=en.
     */
    user: "strongestmetalonearth@gmail.com",
    password: "Metal@123!!",
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    authTimeout: 10000,
};
 
const imap = new Imap(config);
// Obj to save mails...
const mailObj = {};
 
const openInbox = (cb) => {
  imap.openBox('INBOX', true, cb);
}

const onMessageFetchSuccess = (msg, mailSeqNo) => {
    mailObj[mailSeqNo] = {};

    var parser = new MailParser();

    parser.on('data', data => {
        if(data && data.textAsHtml){
            mailObj[mailSeqNo].body = data.textAsHtml
        }
    });

    msg.on("body", function(stream) {
        var buffer = ''
        stream.on("data", function(chunk) {
            parser.write(chunk.toString("utf8"));
            buffer += chunk.toString('utf8');
        });

        stream.once('end', function() {
            const header = Imap.parseHeader(buffer);
            if(Object.keys(header).length > 0){
                mailObj[mailSeqNo] = {
                    ...mailObj[mailSeqNo],
                    ...header
                }
            }
        });
    });

    msg.once("end", function() {
        parser.end();
    });
}

const onInboxSuccess = (err, box) => {
    if (err) throw err;
    var fetch = imap.seq.fetch('1:*', { 
        bodies: ['TEXT','HEADER.FIELDS (FROM TO SUBJECT DATE)'],
        headers: true
    });
    
    fetch.on('message', onMessageFetchSuccess);
    fetch.once('error', function(err) {
      console.log('Fetch error: ' + err);
    });
    fetch.once('end', function() {
      console.log('Done fetching all messages!');
      imap.end();
    });
}

const filePathPreparation = async (pathArray) => {
    let jsonPath = pathArray[0];
    for (let idx = 1; idx < pathArray.length; idx++) {
        jsonPath += `/${pathArray[idx]}`;
        const pathExists = fs.existsSync(jsonPath);
        if(!pathExists){
            await AsyncFs.mkdir(jsonPath);
        }
        console.log(jsonPath);
    }
    return jsonPath;
}

const writeToPath = async  (data) => {
    try {
        const pathArray = [__dirname, 'mails', 'json', config.user];
        const jsonPath = await filePathPreparation(pathArray);
        await AsyncFs.writeFile(path.join(jsonPath, "info.json"), JSON.stringify(data));
        console.log(`Done writing...`);
    } catch (error) {
        console.log("Failed to Write");
    }
}

const listenToMails = (mail) => {
    if(mail){
        const {to, from, subject, html} = mail;
        const tempObj = {to, from, subject};
        console.log(tempObj);
    }
} 

const onceDoneWithImap = () => {
    console.log('Connection ended');
    writeToPath(mailObj)
    .then(resp => {
        // Start listening to mails
        const mailNotifier = notifier(config)
        mailNotifier
        .on('end', () => mailNotifier.start()) // session closed
        .on('mail', listenToMails)
        .start();
    }).catch(error => { 
        console.log("Failed to write mails");
    });
}

 
imap.once('ready', function() {
  openInbox(onInboxSuccess);
});
 
imap.once('error', function(err) {
  console.log(err);
});
 
imap.once('end', onceDoneWithImap);
 
imap.connect();
