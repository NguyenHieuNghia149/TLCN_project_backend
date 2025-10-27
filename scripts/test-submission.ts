import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

async function testSubmission() {
  try {
    console.log('🧪 Testing Code Submission...');

    // First, let's try to login or register a test user
    console.log('📝 Attempting to register/login test user...');

    const loginData = {
      email: 'test@example.com',
      password: 'password123',
    };

    let token;
    try {
      // Try to login first
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, loginData);
      token = loginResponse.data.data.token;
      console.log('✅ Login successful');
    } catch (loginError: any) {
      console.log('🔍 Login error details:', {
        status: loginError.response?.status,
        code: loginError.response?.data?.code,
        message: loginError.response?.data?.message,
      });

      if (
        loginError.response?.status === 401 &&
        loginError.response?.data?.code === 'INVALID_CREDENTIALS'
      ) {
        // User doesn't exist, try to register
        console.log('👤 User not found, attempting registration...');
        const registerData = {
          ...loginData,
          firstName: 'Test',
          lastName: 'User',
          role: 'STUDENT',
        };

        try {
          const registerResponse = await axios.post(`${API_BASE}/auth/register`, registerData);
          token = registerResponse.data.data.token;
          console.log('✅ Registration successful');
        } catch (registerError: any) {
          console.error(
            '❌ Registration failed:',
            registerError.response?.data || registerError.message
          );
          throw registerError;
        }
      } else {
        throw loginError;
      }
    }

    // Now test submission
    console.log('📤 Testing code submission...');

    const submissionData = {
      sourceCode: `#include<iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b;
    return 0;
}`,
      language: 'cpp',
      problemId: '0f465ec8-b3a7-402e-8d5a-a7e99a2f37cb',
    };

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const submissionResponse = await axios.post(`${API_BASE}/submissions`, submissionData, {
      headers,
    });

    console.log('✅ Submission created successfully!');
    console.log('📊 Submission ID:', submissionResponse.data.data.id);
    console.log('📊 Status:', submissionResponse.data.data.status);

    // Wait a bit for processing
    console.log('⏳ Waiting for processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check submission status
    console.log('🔍 Checking submission status...');
    const statusResponse = await axios.get(
      `${API_BASE}/submissions/${submissionResponse.data.data.id}`,
      { headers }
    );

    console.log('📊 Final Status:', statusResponse.data.data.status);
    console.log('📊 Score:', statusResponse.data.data.score);
    console.log('📊 Results:', statusResponse.data.data.result);

    return {
      success: true,
      submissionId: submissionResponse.data.data.id,
      status: statusResponse.data.data.status,
      score: statusResponse.data.data.score,
    };
  } catch (error: any) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

// Run the test
testSubmission().then(result => {
  console.log('\n📋 Test Result:', result);
  process.exit(result.success ? 0 : 1);
});
