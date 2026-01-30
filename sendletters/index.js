import functions from '@google-cloud/functions-framework';
import nodemailer from 'nodemailer';
import imaps from 'imap-simple';
import iconv from 'iconv-lite';

// GCP Cloud Function: Send email via Mail.ru SMTP + copy to Sent folder via IMAP
functions.http('send', async (req, res) => {
  try {
    const email = req.body.email;           // Recipient email address
    const letter = req.body.text;          // Raw email content (Subject: ... + body)
    console.log(letter);

    // Parse subject from first line, normalize case (e.g., "Subject: Test" → "Test")
    const [firstLine, ...rest] = letter.split('\n');
    let subject = (firstLine.replace(/^Subject:\s*/, '')).toLowerCase();
    subject = subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();
        
    const htmlBody = rest.join('\n');      // Join remaining lines as email body
    console.log("TEXT:", iconv.encode(htmlBody, 'utf-8').toString());
    
    // Send via SMTP + copy to Sent folder
    await sendEmail(email, subject, iconv.encode(htmlBody, 'utf-8').toString(), process.env.SENDER_EMAIL);

    res.status(200).send('Emails sent successfully.');
  } catch (error) {
    console.error('Error sending emails:', error);
    res.status(500).send('Email is wrong');  // Note: Should use 500 for errors
  }
});

// Send email via Mail.ru SMTP → copy raw message to Sent folder via IMAP
async function sendEmail(to, subject, htmlBody, senderEmail) {
  console.log("EMAIL:", to);
  const password = process.env.password;  // Mail.ru app password from env

  // Nodemailer: Mail.ru SMTP transporter
  const transporter = nodemailer.createTransporter({
    service: process.env.SMTP_SERVICE || 'your-smtp',
    auth: {
      user: senderEmail,
      pass: password
    },
  });

  const mailOptions = {
    from: senderEmail,
    to: to,
    subject: subject,
    text: htmlBody,  // Plain text body (iconv UTF-8 encoded)
  };

  return new Promise((resolve, reject) => {
    // Step 1: Send via SMTP
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
        return reject(error);
      }
      console.log('Message sent: %s', info.messageId);

      // Step 2: Copy to Sent folder via IMAP
      let config = {
        imap: {
          user: senderEmail,
          password: password,
          host: process.env.IMAP_HOST || 'your-imap-host',
          port: 993,
          tls: true,
          authTimeout: 3000,
        },
      };

      imaps.connect(config).then(connection => {
        return connection.openBox('Sent', false).then(() => {
          // Raw RFC2822 email for IMAP APPEND
          const rawEmail = [
            `From: "Your Name" <${senderEmail}>`,
            `To: ${to}`,
            `Subject: ${subject}`,
            '',
            htmlBody
          ].join('\r\n');

          // Append raw email to Sent folder
          connection.append(rawEmail, { mailbox: 'Sent' }, (err) => {
            if (err) {
              console.log(err);
              connection.end();
              return reject(err);
            } else {
              console.log('Message copied to Sent folder');
              connection.end();
              resolve(info);
            }
          });
        }).catch(err => {
          console.log('IMAP connection error:', err);
          reject(err);
        });
      }).catch(err => {
        console.log('IMAP connection error:', err);
        reject(err);
      });
    });
  });
}
