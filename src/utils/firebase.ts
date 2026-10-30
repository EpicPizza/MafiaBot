import { configDotenv } from 'dotenv';
import { type App, cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { type Auth, getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import { type Firestore, getFirestore as getFirebaseFirestore } from 'firebase-admin/firestore';

configDotenv();

export let firebaseAdmin = getFirebaseAdmin(process.env.FIREBASE_ADMIN as string, "main");
export let phoneAdmin = getFirebaseAdmin(process.env.PHONE_ADMIN as string, "phone")

function getFirebaseAdmin(serviceAccount: string, name: string) {
    let app: App | undefined = undefined;
    let auth: Auth | undefined = undefined;
    let firestore: Firestore | undefined = undefined;

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

    return {
        getApp: getFirebaseApp,
        getAuth: getAuth,
        getFirestore: getFirestore,
    }
}
