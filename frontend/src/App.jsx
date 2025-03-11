import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import './App.css';

// Socket.IO connection
const socket = io(
  process.env.NODE_ENV === 'production'
    ? 'https://videochat-rx5f.onrender.com'
    : 'http://localhost:3000',
  {
    transports: ['websocket', 'polling'],
    reconnection: true,
  }
);

socket.on('connect', () => console.log('Connected to server:', socket.id));
socket.on('disconnect', () => console.log('Disconnected from server'));

function App() {
  const [userId, setUserId] = useState('');
  const [remoteId, setRemoteId] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const [inCall, setInCall] = useState(false); // New state to track active call
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  // Get user media (video and audio)
  useEffect(() => {
    async function getUserMedia() {
      console.log('Requesting media devices...');
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: true,
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch((err) =>
            console.error('Play error:', err)
          );
        }
      } catch (err) {
        console.error('Error accessing media devices:', err);
      }
    }

    getUserMedia();
  }, []);

  // Set up WebRTC peer connection
  const setupPeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
    });

    localStreamRef.current?.getTracks().forEach((track) => {
      peerConnectionRef.current.addTrack(track, localStreamRef.current);
    });

    peerConnectionRef.current.ontrack = (event) => {
      console.log('Remote stream received:', event.streams[0]);
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    peerConnectionRef.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { to: remoteId, candidate: event.candidate });
      }
    };

    // Handle connection state changes
    peerConnectionRef.current.onconnectionstatechange = () => {
      if (
        peerConnectionRef.current.connectionState === 'disconnected' ||
        peerConnectionRef.current.connectionState === 'failed'
      ) {
        handleHangUp(false);
      }
    };
  };

  // Socket.IO event listeners
  useEffect(() => {
    socket.on('incoming-call', async ({ from, offer }) => {
      setRemoteId(from);
      setupPeerConnection();
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
      setInCall(true);
    });

    socket.on('call-answered', async ({ answer }) => {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      setInCall(true);
      setIsCalling(false);
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      }
    });

    socket.on('call-error', (message) => {
      alert(message);
      setIsCalling(false);
    });

    socket.on('end-call', () => {
      handleHangUp(false);
    });

    return () => {
      socket.off('incoming-call');
      socket.off('call-answered');
      socket.off('ice-candidate');
      socket.off('call-error');
      socket.off('end-call');
    };
  }, []);

  const handleRegister = () => {
    if (userId) {
      socket.emit('register', userId);
      alert(`Registered as ${userId}`);
    }
  };

  const handleCall = async () => {
    if (remoteId === userId) {
      alert('Cannot call yourself');
      return;
    }
    if (!remoteId || !userId) {
      alert('Please enter both your ID and the remote ID');
      return;
    }
    if (inCall) {
      alert('Already in a call');
      return;
    }
    console.log(`Initiating call from ${userId} to ${remoteId}`);
    setIsCalling(true);
    setupPeerConnection();
    try {
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socket.emit('call', { from: userId, to: remoteId, offer });
    } catch (err) {
      console.error('Error during call initiation:', err);
      setIsCalling(false);
    }
  };

  const handleHangUp = (emitSignal = true) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setInCall(false);
    setIsCalling(false);
    if (emitSignal) {
      socket.emit('end-call', { to: remoteId });
    }
  };

  return (
    <div className="app">
      <h1>Video Call App</h1>
      <div className="controls">
        <input
          type="text"
          placeholder="Your Unique ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <button onClick={handleRegister}>Register</button>
        <input
          type="text"
          placeholder="Remote User ID"
          value={remoteId}
          onChange={(e) => setRemoteId(e.target.value)}
        />
        <button
          onClick={handleCall}
          disabled={isCalling || inCall || !userId || !remoteId}
        >
          {isCalling ? 'Calling...' : 'Call'}
        </button>
        {inCall && <button onClick={() => handleHangUp(true)}>Hang Up</button>}
      </div>
      <div className="video-container">
        <video ref={localVideoRef} autoPlay muted className="local-video" />
        <video ref={remoteVideoRef} autoPlay className="remote-video" />
      </div>
    </div>
  );
}

export default App;