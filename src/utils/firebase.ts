import { configDotenv } from 'dotenv';
import { default as admin, default as FirebaseAdmin } from 'firebase-admin';
import type { Auth } from 'firebase-admin/auth';
import { type Firestore, getFirestore as getFirebaseFirestore } from 'firebase-admin/firestore';

configDotenv();

const firebaseAuth = FirebaseAdmin.auth;

export let firebaseAdmin = getFirebaseAdmin(process.env.FIREBASE_ADMIN as string, "main");
export let phoneAdmin = getFirebaseAdmin(process.env.PHONE_ADMIN as string, "phone")

function getFirebaseAdmin(serviceAccount: string, name: string) {
    let app: admin.app.App | undefined = undefined;
    let auth: Auth | undefined = undefined;
    let firestore: Firestore | undefined = undefined;

    const getFirebaseApp = (): admin.app.App => {
        if(app == undefined) { //this get reruns on every change durring preview, but firebase admin still sees the pervious instance made, so this just checks if we can use a previous firebase instance, otherwise it will cause an error because firebase thinks we are reintializing
        var found = false;
            for(var i = 0; i < admin.apps.length; i++) {
                if(admin.apps[i] != null && (admin.apps[i] as admin.app.App).name == name) {
                    app = admin.apps[i] as admin.app.App;
                    found = true;
                }
            }
            if(found == false) {
                app = admin.initializeApp({
                    credential: (admin.credential.cert(JSON.parse(serviceAccount) as admin.ServiceAccount))
                }, name);
            }
        }
    
        return app as admin.app.App;
    }

    const getAuth = (): Auth => {
        if(auth == undefined) {
            auth = firebaseAuth(getFirebaseApp());
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