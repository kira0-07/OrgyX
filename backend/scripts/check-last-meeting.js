require('dotenv').config();
const mongoose = require('mongoose');
const { Meeting } = require('../models');

async function check() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const lastMeeting = await Meeting.findOne().sort({ createdAt: -1 });
    if (!lastMeeting) {
      console.log('No meetings found.');
      process.exit(0);
    }

    console.log('\n--- Latest Meeting Status ---');
    console.log(`ID: ${lastMeeting._id}`);
    console.log(`Name: ${lastMeeting.name}`);
    console.log(`Status: ${lastMeeting.status}`);
    console.log(`Created At: ${lastMeeting.createdAt}`);
    console.log(`Has Transcript: ${!!lastMeeting.transcript}`);
    console.log(`Has Summary: ${!!lastMeeting.analysis?.summary}`);
    
    console.log('\nProcessing Steps:');
    lastMeeting.processingSteps.forEach(step => {
      console.log(`- ${step.step}: ${step.status} (${step.message || 'no message'})`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

check();
