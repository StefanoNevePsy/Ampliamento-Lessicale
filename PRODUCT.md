# Ampliamento Lessicale

## Register
product

## Product Purpose
Clinical stimulation app for psychologists working with neurodivergent children and adolescents. Used during therapy sessions to run vocabulary expansion, categorization, memory, and verbal association exercises through gamified card-based interactions.

## Users
- **Primary**: Clinical psychologists running face-to-face therapy sessions with children/adolescents
- **Secondary**: The children/adolescents interacting with the cards and game screens during sessions
- Children range from approximately 5-16 years old, many with attention or cognitive differences
- The psychologist operates the app on a tablet (Android), often holding it or placing it on a table between therapist and child

## Platform
- Single-page web app running inside Android WebView via Capacitor
- Primary device: Android tablets (10-11 inch)
- Touch-first interaction, but also supports keyboard shortcuts for the therapist
- No internet required during sessions (offline-first, IndexedDB storage)

## Core Interactions
1. **Home screen**: Select patient, configure session parameters (mode, tags, time delay)
2. **Game modes**: Card-based exercises (random display, intraverbal prompts, intruder detection, categorization, memory/ricorda)
3. **Scoring**: Floating V (correct) / X (incorrect) / P (prompted) buttons, with session score counter
4. **Editor**: Create and manage card sets with images, labels, tags
5. **Session history**: Review past sessions per patient
6. **Backup**: ZIP export/import of all data including images

## Brand & Tone
- Professional but warm; clinical tool that doesn't feel sterile
- Child-friendly game screens that are engaging without being overstimulating
- The therapist-facing controls should feel efficient and unobtrusive
- Italian language interface throughout
- Current accent color is a teal/cyan (#00bfa5 area), dark theme

## Anti-references
- Generic flashcard apps (too simple, no clinical scoring)
- Overly gamified children's apps (too distracting, too many animations)
- Medical/hospital software (too cold, too complex)
- Material Design 3 cookie-cutter apps (too generic)

## Key Constraints
- Must work reliably in Android WebView (no bleeding-edge CSS)
- Touch targets must be large enough for children
- Scoring buttons must be quickly accessible for the therapist during fast-paced exercises
- Cards should be visually clear with good image display
- Dark theme is the default and primary theme
