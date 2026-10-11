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
            Text("Journeys are better together").foregroundStyle(.secondary)
            GroupBox {
                if let awaiting = model.session as? SessionStateAwaitingLink {
                    Text("Check your email").font(.headline)
                    Text("If \(awaiting.email) can sign in, a link is on its way. It works once, for 15 minutes. Paste it here.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    TextField("Link from the email", text: $pasted, axis: .vertical).textFieldStyle(.roundedBorder)
                    Button(model.busy ? "Signing in…" : "Sign in") { Task { await model.verify(pasted) } }
                        .buttonStyle(.borderedProminent).disabled(model.busy || pasted.isEmpty)
                    Button("Use another address") { Task { await model.signOut() } }
                } else {
                    Text("Sign in").font(.headline)
                    Text("We email you a one-time link. No password.").font(.subheadline).foregroundStyle(.secondary)
                    TextField("Email", text: $email).textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    Button(model.busy ? "Sending…" : "Email me a link") { Task { await model.requestLink(email) } }
                        .buttonStyle(.borderedProminent).disabled(model.busy || !email.contains("@"))
                }
                if let error = model.error { Text(error).foregroundStyle(.red).font(.subheadline) }
            }
            Button("Browse the sample trip") { model.sampleMode = true }.buttonStyle(.bordered)
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
            Text("You're invited.").font(.largeTitle.bold())
            if let s = model.session as? SessionStateNeedsInvite {
                Text("Signed in as \(s.email)").foregroundStyle(.secondary)
            }
            GroupBox {
                Text("Join a trip").font(.headline)
                Text("Enter the code your organizer gave you. Your role comes with the code.")
                    .font(.subheadline).foregroundStyle(.secondary)
                TextField("Invite code", text: $code).textFieldStyle(.roundedBorder).textInputAutocapitalization(.characters)
                Button(model.busy ? "Joining…" : "Join trip") { Task { await model.redeem(code) } }
                    .buttonStyle(.borderedProminent).disabled(model.busy || code.replacingOccurrences(of: "-", with: "").count < 8)
                if let error = model.error { Text(error).foregroundStyle(.red).font(.subheadline) }
            }
            Button("Sign out") { Task { await model.signOut() } }
            Spacer()
        }
        .padding(24)
    }
}
