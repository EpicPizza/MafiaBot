import admin from 'firebase-admin'
import FirebaseAdmin from 'firebase-admin';
const firebaseAuth = FirebaseAdmin.auth;
import type { Auth, DecodedIdToken, UserRecord } from 'firebase-admin/auth';
import { type Firestore, getFirestore as getFirebaseFirestore } from 'firebase-admin/firestore';
export let firebaseAdmin = getFirebaseAdmin();

function getFirebaseAdmin() {
    let app: admin.app.App | undefined = undefined;
    let auth: Auth | undefined = undefined;
    let firestore: Firestore | undefined = undefined;

    const getFirebaseApp = (): admin.app.App => {
        if(app == undefined) { //this get reruns on every change durring preview, but firebase admin still sees the pervious instance made, so this just checks if we can use a previous firebase instance, otherwise it will cause an error because firebase thinks we are reintializing
            if(process.env.DEV == "TRUE") {
                if(admin.apps == null) {
                    app = admin.initializeApp({
                        credential: (admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN as string) as admin.ServiceAccount))
                    }, "Server");
                } else if(admin.apps.length == 0) {
                    app = admin.initializeApp({
                        credential: (admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN as string) as admin.ServiceAccount))
                    }, "Server");
                } else {
                    var found = false;
                    for(var i = 0; i < admin.apps.length; i++) {
                        if(admin.apps[i] != null && (admin.apps[i] as admin.app.App).name == "Server") {
                            app = admin.apps[i] as admin.app.App;
                            found = true;
                        }
                    }
                    if(found == false) {
                        throw new Error("Firebase Admin is being goofy again");
                    }
                }
            } else {
                if(admin.apps == null) {
                    app = admin.initializeApp({}, "Server");
                } else if(admin.apps.length == 0) {
                    app = admin.initializeApp({}, "Server");
                } else {
                    var found = false;
                    
                    for(var i = 0; i < admin.apps.length; i++) {
                        if(admin.apps[i] != null && (admin.apps[i] as admin.app.App).name == "Server") {
                            app = admin.apps[i] as admin.app.App;
                            found = true;
                        }
                    }

                    if(found == false) {
                        throw new Error("Firebase Admin is being goofy again");
                    }
                }
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
            firestore = getFirebaseFirestore(getFirebaseApp());
        }

        return firestore;
    }

    return {
        getApp: getFirebaseApp,
        getAuth: getAuth,
        getFirestore: getFirestore,
    }
}