import { configDotenv } from 'dotenv';
import { type App, cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { type Auth, getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import { type Firestore, getFirestore as getFirebaseFirestore } from 'firebase-admin/firestore';
import { type Storage, getStorage as getFirebaseStorage } from 'firebase-admin/storage';

configDotenv();

export let firebaseAdmin = getFirebaseAdmin(process.env.FIREBASE_ADMIN as string, "main");
export let phoneAdmin = getFirebaseAdmin(process.env.PHONE_ADMIN as string, "phone")

function getFirebaseAdmin(serviceAccount: string, name: string) {
    let app: App | undefined = undefined;
    let auth: Auth | undefined = undefined;
    let firestore: Firestore | undefined = undefined;
    let storage: Storage | undefined = undefined;

    const getFirebaseApp = (): App => {
        if(app == undefined) { //this get reruns on every change durring preview, but firebase admin still sees the pervious instance made, so this just checks if we can use a previous firebase instance, otherwise it will cause an error because firebase thinks we are reintializing
            app = getApps().find(existing => existing.name == name);

            if(app == undefined) {
                app = initializeApp({
                    credential: cert(JSON.parse(serviceAccount) as ServiceAccount)
                }, name);
            }
        }

        return app;
    }

    const getAuth = (): Auth => {
        if(auth == undefined) {
            auth = getFirebaseAuth(getFirebaseApp());
        }

        return auth;
    }

    const getFirestore = (): Firestore => {
        if(firestore == undefined) {
            firestore = getFirebaseFirestore(getFirebaseApp(), "main");
        }

        return firestore;
    }

    const getStorage = (): Storage => {
        if(storage == undefined) {
            storage = getFirebaseStorage(getFirebaseApp());
        }

        return storage;
    }

    /** FIREBASE_STORAGE_BUCKET if set, otherwise the project's default bucket. */
    const getBucket = () => {
        const name = process.env.FIREBASE_STORAGE_BUCKET || (JSON.parse(serviceAccount).project_id + ".firebasestorage.app");

        return getStorage().bucket(name);
    }

    return {
        getApp: getFirebaseApp,
        getStorage: getStorage,
        getBucket: getBucket,
        getAuth: getAuth,
        getFirestore: getFirestore,
    }
}
