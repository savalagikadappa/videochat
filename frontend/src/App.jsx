import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3000', {
  transports: ['websocket', 'polling'],
  reconnection: true,
});

socket.on('connect', () => console.log('Connected to server:', socket.id));
socket.on('disconnect', () => console.log('Disconnected from server'));

function App() {
  const [userId, setUserId] = useState('');
  const [remoteId, setRemoteId] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);

  useEffect(() => {
    async function getUserMedia() {
      console.log('Requesting media devices...');
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        },
        audio: true
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        console.log('Video track settings:', settings);

        localVideoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded...');
          localVideoRef.current.width = settings.width || 640;
          localVideoRef.current.height = settings.height || 480;

          localVideoRef.current.play().then(() => {
            console.log('Video playing successfully');
          }).catch((err) => {
            console.error('Play error:', err);
          });

          setTimeout(() => {
            console.log('Final video dimensions:', localVideoRef.current.videoWidth, localVideoRef.current.videoHeight);
            if (localVideoRef.current.videoWidth <= 2 || localVideoRef.current.videoHeight <= 2) {
              console.warn('⚠️ Low resolution detected. Reloading camera feed.');
              localVideoRef.current.srcObject = null;
              setTimeout(() => {
                localVideoRef.current.srcObject = stream;
                localVideoRef.current.play();
              }, 500);
            }
          }, 500);
        };
      } catch (err) {
        console.error('Error accessing media devices:', err);
      }
    }

    getUserMedia();
  }, []);

  const setupPeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    localStreamRef.current?.getTracks().forEach(track => {
      peerConnectionRef.current.addTrack(track, localStreamRef.current);
    });

    peerConnectionRef.current.ontrack = event => {
      if (!remoteVideoRef.current.srcObject) {
        console.log('Remote stream received:', event.streams[0]);
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current.onicecandidate = event => {
      if (event.candidate) {
        socket.emit('ice-candidate', { to: remoteId, candidate: event.candidate });
      }
    };
  };

  useEffect(() => {
    socket.on('incoming-call', async ({ from, offer }) => {
      setRemoteId(from);
      setupPeerConnection();
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });
    });

    socket.on('call-answered', async ({ answer }) => {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('call-error', message => {
      alert(message);
      setIsCalling(false);
    });

    return () => {
      socket.off('incoming-call');
      socket.off('call-answered');
      socket.off('ice-candidate');
      socket.off('call-error');
    };
  }, []);

  const handleRegister = () => {
    if (userId) {
      socket.emit('register', userId);
      alert(`Registered as ${userId}`);
    }
  };

  const handleCall = async () => {
    if (!remoteId || !userId) {
      alert('Please enter both your ID and the remote ID');
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

  return (
    <div className="app">
      <h1>Video Call App</h1>
      <div className="controls">
        <input type="text" placeholder="Your Unique ID" value={userId} onChange={e => setUserId(e.target.value)} />
        <button onClick={handleRegister}>Register</button>
        <input type="text" placeholder="Remote User ID" value={remoteId} onChange={e => setRemoteId(e.target.value)} />
        <button onClick={handleCall} disabled={isCalling}>{isCalling ? 'Calling...' : 'Call'}</button>
      </div>
      <div className="video-container">
        <video ref={localVideoRef} autoPlay muted className="local-video" />
        <video ref={remoteVideoRef} autoPlay className="remote-video" />
      </div>
    </div>
  );
}

export default App;
