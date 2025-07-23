import React, { useState, useRef, useEffect } from 'react';
import { Circle, Square, Clock } from 'lucide-react';
import { FFmpeg, FileData } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import JSZip from 'jszip';

type AppState = 'question' | 'camera' | 'login' | 'end';

const studentsQuestions = [
  "3 ans d'Epitech, c'est fait ! Maintenant, c'est quoi l'objectif ?",
  "C'est le début de la fin.. Si tu devais résumer ton expérience Epitech en un mot ?",
  "Après 3 années passées à Epitech, quel est ton plus beau souvenir ?",
  "Après 3 ans d'études, une chose que tu as apprise sur toi-même ?",
  "On fait un retour dans le passé. Qu'est-ce que tu dirais à ton toi d'il y a 3 ans ?",
  "Pendant ces 3 ans, est-ce que tu t'es dit \"Je vais jamais y arriver !\" ? Tu ressens quoi maintenant que tu as réussi ?",
  "Ce qui va le plus te manquer pendant ta 4e année ?!",
  "Un conseil pour survivre à 3 ans d'Epitech ?",
  "Un mot ou une expression typique de votre promo ?",
  "Désolée, tu dois refaire les 3 ans ! Qu'est-ce que tu refais en mieux ?",
  "Complète la phrase : \"Je pars, mais je reviendrais avec...\"",
  "De 1 à 10, t'es heureux à quel point ? T'as hâte de quoi ?"
];
const parentsQuestions = [
  "Une première partie de terminé ! Comment vous décririez ces 3 ans d'Epitech ?",
  "Sur une échelle de 1 à 10, à quel point êtes-vous fier de votre enfant ? Un mot pour lui ?",
  "Après 3 ans d'Epitech, qu'est-ce qui a changé chez votre enfant ?",
  "Oh, un parent fier ! Qu'est-ce que vous ressentez aujourd'hui ?",
  "Faites-nous rêver, vous irez le rendre visite en 4ème ou 5ème année ?",
  "Ca y est, votre enfant s'envole pour de nouvelles aventures ! Un conseil à lui donner ?",
];

function App() {
  const timerDuration = 10;
  const [question, SetQuestion] = useState("");
  const [isStudent, setIsStudent] = useState(true);
  const [email, setEmail] = useState('');
  const [acceptedDiffusion, setAcceptedDiffusion] = useState(false);
  const [acceptedEmail, setAcceptedEmail] = useState(false);
  const [appState, setAppState] = useState<AppState>('login');
  const [timeLeft, setTimeLeft] = useState(timerDuration);
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailQuestionsMap = useRef<Map<string, string[]>>(new Map());

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const addQuestionForEmail = (email: string, question: string) => {
    if (!email) return;
    const prev = emailQuestionsMap.current.get(email) || [];
    emailQuestionsMap.current.set(email, [...prev, question]);
  };

  const handleStart = () => {
    if (isStudent) {
      const randomIndex = Math.floor(Math.random() * studentsQuestions.length);
      SetQuestion(studentsQuestions[randomIndex]);
    } else {
      const randomIndex = Math.floor(Math.random() * parentsQuestions.length);
      SetQuestion(parentsQuestions[randomIndex]);
    }
    setAppState('question');
    setTimeLeft(timerDuration);
  };

  const initCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 768, height: 1024 },
        audio: true
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasPermission(true);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Failed to access camera. Please check permissions.');
    }
  };

  // Question page timer
  useEffect(() => {
    if (appState === 'question' && timeLeft > -1) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (appState === 'question' && timeLeft < 0) {
      setAppState('camera');
      initCamera();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [appState, timeLeft]);

  // Initialize camera when transitioning to camera view
  useEffect(() => {
    if (appState === 'camera') {
      initCamera();
    }

    return () => {
      // Cleanup when leaving camera view
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [appState]);

  useEffect(() => {
  } ,[appState]);

  // Handle keyboard events (only when in camera view)
  useEffect(() => {
    if (appState !== 'camera') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault();
        toggleRecording();
      } else if (event.code === 'KeyR' && isRecording) {
        // Stop recording and reset (do not save video)
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          // Remove onstop handler to prevent saving
          mediaRecorderRef.current.onstop = null;
          mediaRecorderRef.current.stop();
          recordedChunksRef.current = [];
          setIsRecording(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appState, isRecording]);

  const toggleRecording = () => {
    if (!streamRef.current) return;

    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      // Start recording
      recordedChunksRef.current = [];

      try {
        const mediaRecorder = new MediaRecorder(streamRef.current, {
          mimeType: 'video/webm;codecs=vp9'
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {

          const videoUuid = crypto.randomUUID();
          const consentText =
            `Question: ${isStudent ? 'Étudiant' : 'Parent'} : ${question}\n` +
            `Nom de la vidéo: ${videoUuid}.webm\n` +
            `Email: ${email}\n` +
            `Consentement pour l'utilisation de la vidéo sur les réseaux sociaux d'Epitech : ${acceptedDiffusion ? 'oui' : 'non'}\n` +
            `Consentement pour l'utilisation de l'adresse email pour recevoir la vidéo: ${acceptedEmail ? 'oui' : 'non'}\n` +
            `Date et heure d'enregistrement: ${new Date().toString()}\n` +
            `Évenement: soirée de fin de cycle`
          ;

          const zip = new JSZip();
          const videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const videArrayBuffer = await videoBlob.arrayBuffer();
          zip.file(`${videoUuid}.webm`, videArrayBuffer);
          zip.file(`${videoUuid}.txt`, consentText);

          zip.generateAsync({ type: 'blob' }).then((content) => {
            const element = document.createElement('a');
            element.href = URL.createObjectURL(content);
            element.download = `${videoUuid}.zip`;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            setAppState('end');
          });
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Error starting recording:', err);
        setError('Failed to start recording');
      }
    }
  };

  if (appState === 'end') {
    const reloadTimer = 30;
    setTimeout(() => {
      document.location.reload();
    }, reloadTimer * 1000);
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-8">
          <h1 className="text-5xl font-bold text-white mb-6">Merci !</h1>
          <p className="text-lg text-blue-100 mb-8">
            Votre vidéo a été enregistrée avec <span className='font-bold'>succès</span>.
          </p>
          <p className="text-lg text-blue-100 mb-8">
            Vous pouvez cliquer sur le bouton ci-dessous pour répondre à une autre question.
          </p>
          <p className="text-lg text-blue-100 mb-8">
            (Cette page se rechargera automatiquement dans {reloadTimer} secondes)
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Recommencer
          </button>
        </div>
      </div>
    );
  }

  if (appState === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-8">
          <h1 className="text-5xl font-bold text-white mb-6">Bienvenue</h1>
          <p className="text-lg text-blue-100 mb-8">
            Qui va répondre, étudiant ou parent ?
          </p>
          <div className="flex justify-center mb-6">
            <button
              onClick={() => setIsStudent(true)}
              className={`px-4 py-2 rounded-lg mr-4 transition-colors ${isStudent ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              Étudiant
            </button>
            <button
              onClick={() => setIsStudent(false)}
              className={`px-4 py-2 rounded-lg transition-colors ${!isStudent ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              Parent
            </button>
          </div>
          {/* <div className="flex justify-center mb-6"> */}
            <p className="text-lg text-blue-100 mb-8">
              Entrez votre email pour recevoir la vidéo de votre enregistrement
            </p>
            <input
              type="email"
              placeholder="Entrez votre email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 mb-4 rounded-lg bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            {/* </div> */}
          <div className="flex flex-col items-center mb-4">
            <div className="flex">
              <input
                id="diffusion"
                type="checkbox"
                className="mr-2"
                required
                checked={acceptedDiffusion}
                onChange={(e) => setAcceptedDiffusion(e.target.checked)}
                />
              <label htmlFor="diffusion" className="text-white text-sm select-none">
                J'accepte l'utilisation de ma vidéo sur les réseaux sociaux d'Epitech
              </label>
            </div>
            <div className="flex">
              <input
                id="email"
                type="checkbox"
                className="mr-2"
                required
                checked={acceptedEmail}
                onChange={(e) => setAcceptedEmail(e.target.checked)}
                />
              <label htmlFor="email" className="text-white text-sm select-none">
                J'accepte l'utilisation de mon adresse mail pour recevoir la vidéo
              </label>
            </div>
          </div>
          <button
            onClick={handleStart}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Commencer
          </button>
        </div>
      </div>
    );
  }

  // Question Page
  if (appState === 'question') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center max-w-2xl mx-auto px-8">
          {/* Timer Circle */}
          <div className="relative mb-12">
            <div className="w-32 h-32 mx-auto">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  stroke="white"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 45}`}
                  strokeDashoffset={`${2 * Math.PI * 45 * (timeLeft / timerDuration)}`}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Clock className="w-8 h-8 text-white mx-auto mb-2" />
                  <div className="text-3xl font-bold text-white">{timeLeft}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Question Content */}
          <div className="space-y-8">
            <h1 className="text-5xl font-bold text-white leading-tight break-before-auto">
              {question}
            </h1>
            <p className="text-xl text-blue-100 leading-relaxed">
              À la fin du compte à rebours, appuyer sur le bouton ESPACE pour commencer l'enregistrement.
            </p>
          </div>

          {/* Progress indicator */}
          <div className="mt-16">
            <div className="flex justify-center space-x-2">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i < (10 - timeLeft) ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Camera Error State
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Camera Loading State
  if (!hasPermission) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Demande d'accès à la caméra...</div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    );
  }

  // Camera View
  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
      {/* Full-screen video preview */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 object-cover ml-[40%] w-[40%] h-full -scale-x-100"
      />

      {/* Overlay content */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-8 left-8">
          <h1 className="text-4xl font-bold text-white drop-shadow-lg w-[30vw]">
            {question}
          </h1>
          <div className="mt-20 border-2 rounded-xl p-5">
            <h1 className="text-4xl font-bold text-white drop-shadow-lg w-[30vw]">Comment ça marche ?</h1>
            <p className="text-xl font-bold text-white drop-shadow-lg w-[30vw]">
              - Pour démarrer l'enregistrement, appuyer sur <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">Espace</kbd>
              </p>
            <p className="text-xl font-bold text-white drop-shadow-lg w-[30vw]">
              - Pour arrêter et <span className='font-bold text-red-500'>SAUVEGARDER</span> l'enregistrement, appuyer sur <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">Espace</kbd>
              </p>
            <p className="text-xl font-bold text-white drop-shadow-lg w-[30vw]">
              - Pour arrêter et <span className='font-bold text-red-500'>SUPPRIMER</span> l'enregistrement, appuyer sur la touche <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">R</kbd>. Vous pourrez alors refaire une prise!
              </p>
          </div>
        </div>

        {/* Recording indicator */}
        <div className="absolute top-8 right-[36vw] flex items-center space-x-3">
          {isRecording && (
            <div className="flex items-center space-x-2 bg-red-600 bg-opacity-80 px-4 py-2 rounded-full">
              <Circle className="w-4 h-4 fill-white text-white animate-pulse" />
              <span className="text-white font-medium">Enregistrement</span>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="absolute bottom-8 left-[60%] transform -translate-x-1/2">
          <div className="bg-black bg-opacity-60 text-white px-6 py-3 rounded-lg backdrop-blur-sm">
            <div className="flex items-center space-x-2">
              {isRecording ? (
                <Square className="w-5 h-5" />
              ) : (
                <Circle className="w-5 h-5" />
              )}
              <span className="font-medium">
                Appuyer sur  <kbd className="px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500">Espace</kbd> pour {isRecording ? 'arrêter' : 'démarrer'} l'enregistrement
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;