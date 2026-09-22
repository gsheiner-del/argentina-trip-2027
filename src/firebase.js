import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, update } from "firebase/database";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDCOnCe1CWo_i8B8eO2a4dt0Pouc7k7vfE",
  authDomain: "argentina-trip-2027.firebaseapp.com",
  projectId: "argentina-trip-2027",
  storageBucket: "argentina-trip-2027.firebasestorage.app",
  messagingSenderId: "790255097499",
  appId: "1:790255097499:web:5ba925439d18908772183e",
  measurementId: "G-70W87MWDPV",
  databaseURL: "https://argentina-trip-2027-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { database, ref, set, get, onValue, update, auth, signInWithPopup, googleProvider, signOut };
