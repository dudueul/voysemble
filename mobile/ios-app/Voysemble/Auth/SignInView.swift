// Copyright 2026- At Day. All rights reserved.
// Sign-in (atlas #2): email, then paste the link. Mirrors SignInScreen on Android.

import SwiftUI
import VoysembleCore

struct SignInView: View {
    @ObservedObject var model: SessionModel
    @State private var email = ""
    @State private var pasted = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Voysemble").font(.largeTitle.bold())
            Text(tr(.authTagline)).foregroundStyle(.secondary)
            if model.revokedNotice {
                // D28: the organizer revoked this phone; local data is already gone.
                Text(tr(.authRevoked))
                    .font(.subheadline).foregroundStyle(.red)
            }
            GroupBox {
                if let awaiting = model.session as? SessionStateAwaitingLink {
                    Text(tr(.authCheckEmail)).font(.headline)
                    Text(tr1(.authSentBody, awaiting.email))
                        .font(.subheadline).foregroundStyle(.secondary)
                    TextField(tr(.authLinkField), text: $pasted, axis: .vertical).textFieldStyle(.roundedBorder)
                    Button(model.busy ? tr(.authSigningIn) : tr(.authSignIn)) { Task { await model.verify(pasted) } }
                        .buttonStyle(.borderedProminent).disabled(model.busy || pasted.isEmpty)
                    Button(tr(.authUseAnother)) { Task { await model.signOut() } }
                } else {
                    Text(tr(.authSignIn)).font(.headline)
                    Text(tr(.authNoPassword)).font(.subheadline).foregroundStyle(.secondary)
                    TextField(tr(.authEmail), text: $email).textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    Button(model.busy ? tr(.authSending) : tr(.authEmailMe)) { Task { await model.requestLink(email) } }
                        .buttonStyle(.borderedProminent).disabled(model.busy || !email.contains("@"))
                }
                if let error = model.error { Text(error).foregroundStyle(.red).font(.subheadline) }
            }
            Button(tr(.authBrowseSample)) { model.sampleMode = true }.buttonStyle(.bordered)
            Spacer()
        }
        .padding(24)
    }
}

struct InviteView: View {
    @ObservedObject var model: SessionModel
    @State private var code = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(tr(.inviteTitle)).font(.largeTitle.bold())
            if let s = model.session as? SessionStateNeedsInvite {
                Text(tr1(.inviteSignedInAs, s.email)).foregroundStyle(.secondary)
            }
            GroupBox {
                Text(tr(.inviteJoin)).font(.headline)
                Text(tr(.inviteHint))
                    .font(.subheadline).foregroundStyle(.secondary)
                TextField(tr(.inviteCode), text: $code).textFieldStyle(.roundedBorder).textInputAutocapitalization(.characters)
                Button(model.busy ? tr(.inviteJoining) : tr(.inviteJoinTrip)) { Task { await model.redeem(code) } }
                    .buttonStyle(.borderedProminent).disabled(model.busy || code.replacingOccurrences(of: "-", with: "").count < 8)
                if let error = model.error { Text(error).foregroundStyle(.red).font(.subheadline) }
            }
            Button(tr(.commonSignOut)) { Task { await model.signOut() } }
            Spacer()
        }
        .padding(24)
    }
}
