import { materializeContinuityChanges } from '../../src/story/continuity-events.mjs';
const preserved = {
  "admission": {
    "kind": "directive.characterSceneAdmission.v1",
    "playerId": "person.directive-player",
    "sources": {
      "previousAssistant": {
        "messageId": "6",
        "selectedSwipeId": "0",
        "textHash": "eef65136"
      },
      "currentPlayer": {
        "messageId": "7",
        "selectedSwipeId": null,
        "textHash": "4eba3060"
      }
    },
    "hostAudience": {},
    "proposal": {
      "participants": [
        {
          "personId": "mara-whitaker",
          "presence": "present",
          "evidence": [
            {
              "sourceSlot": "previousAssistant",
              "evidenceQuote": "Across the desk, Whitaker had not moved."
            }
          ],
          "audience": [
            {
              "personId": "person.directive-player",
              "acquisition": "heard",
              "evidence": [
                {
                  "sourceSlot": "currentPlayer",
                  "evidenceQuote": "\"For continuity, Captain, what check-in time do you currently have from our conversation?"
                }
              ]
            }
          ],
          "perception": [
            {
              "acquisition": "heard",
              "evidence": {
                "sourceSlot": "previousAssistant",
                "evidenceQuote": "\"Commander, I have no private check-in recorded on your evening schedule."
              }
            },
            {
              "acquisition": "heard",
              "evidence": {
                "sourceSlot": "currentPlayer",
                "evidenceQuote": "\"For continuity, Captain, what check-in time do you currently have from our conversation?"
              }
            }
          ]
        },
        {
          "personId": "priya-nayar",
          "presence": "remote",
          "evidence": [
            {
              "sourceSlot": "previousAssistant",
              "evidenceQuote": "She was on the bridge — the background tone of the ops station filtered through with the faint cadence of a duty-shift conversation nearby, someone's voice cutting off mid-sentence as the channel opened."
            }
          ],
          "audience": [
            {
              "personId": "person.directive-player",
              "acquisition": "heard",
              "evidence": [
                {
                  "sourceSlot": "previousAssistant",
                  "evidenceQuote": "The channel held open, awaiting his response."
                }
              ]
            },
            {
              "personId": "mara-whitaker",
              "acquisition": "heard",
              "evidence": [
                {
                  "sourceSlot": "previousAssistant",
                  "evidenceQuote": "not moved. She sat with her hands resting on the desk surface, watching the combadge with the expression of someone who had just watched her new executive officer interrupt their first meeting to call his operations officer about a calenda"
                }
              ]
            }
          ],
          "perception": [
            {
              "acquisition": "heard",
              "evidence": {
                "sourceSlot": "currentPlayer",
                "evidenceQuote": "\"For continuity, Captain, what check-in time do you currently have from our conversation?"
              }
            },
            {
              "acquisition": "read",
              "evidence": {
                "sourceSlot": "currentPlayer",
                "evidenceQuote": "He opened a private message to Lieutenant Nayar and typed: **Provisional revised check-in: 22:43, observation lounge."
              }
            }
          ]
        }
      ],
      "reactions": [
        {
          "personId": "mara-whitaker",
          "after": []
        },
        {
          "personId": "priya-nayar",
          "after": []
        }
      ],
      "playerContext": [
        {
          "sourceSlot": "currentPlayer",
          "evidenceQuote": "Jonah kept the combadge audio channel open while shifting his PADD so its screen faced away from Captain Whitaker."
        },
        {
          "sourceSlot": "currentPlayer",
          "evidenceQuote": "He opened a private message to Lieutenant Nayar and typed: **Provisional revised check-in: 22:43, observation lounge."
        },
        {
          "sourceSlot": "currentPlayer",
          "evidenceQuote": "text back the time and location you have recorded for me. Keep this off the shared calendar; do not relay it to Captain Whitaker yet.** He sent the message without reading the proposed time or location aloud. Then he returned his attention"
        },
        {
          "sourceSlot": "currentPlayer",
          "evidenceQuote": "\"For continuity, Captain, what check-in time do you currently have from our conversation?"
        },
        {
          "sourceSlot": "currentPlayer",
          "evidenceQuote": "\" He kept the question limited to her existing understanding and waited, making no claim that the provisional change had taken effect."
        }
      ]
    }
  },
  "sourcePair": {
    "previousAssistant": {
      "messageId": "6",
      "selectedSwipeId": "0",
      "textHash": "eef65136",
      "text": "The combadge chirped once, and a half-second of open channel silence preceded the click of connection.\n\n\"Nayar here.\" The voice was clear, unhurried, carrying the slight ambient hum of a console-active workstation. She was on the bridge — the background tone of the ops station filtered through with the faint cadence of a duty-shift conversation nearby, someone's voice cutting off mid-sentence as the channel opened.\n\nThere was a brief pause after the request — not hesitation, but the measured silence of someone pulling up a schedule interface. The soft tone of a PADD confirmation bled through the channel.\n\n\"Commander, I have no private check-in recorded on your evening schedule. Your personal calendar shows nothing between 1800 and 0700 tomorrow.\" A beat. \"If you'd like to add one, I can enter it whenever you're ready — time, location, and access level are yours to set.\"\n\nThe channel held open, awaiting his response.\n\nAcross the desk, Whitaker had not moved. She sat with her hands resting on the desk surface, watching the combadge with the expression of someone who had just watched her new executive officer interrupt their first meeting to call his operations officer about a calendar entry he had asked her to keep off the calendar three minutes ago. The coffee she had poured for him sat untouched on the desk edge, steam threading upward in the viewport light.\n\nHer mouth twitched — not quite a smile, but the acknowledgment of a pattern she had noticed and filed without comment. She said nothing, and waited."
    },
    "currentPlayer": {
      "messageId": "7",
      "selectedSwipeId": null,
      "textHash": "4eba3060",
      "text": "Jonah kept the combadge audio channel open while shifting his PADD so its screen faced away from Captain Whitaker. He opened a private message to Lieutenant Nayar and typed: **Provisional revised check-in: 22:43, observation lounge. Please text back the time and location you have recorded for me. Keep this off the shared calendar; do not relay it to Captain Whitaker yet.** He sent the message without reading the proposed time or location aloud. Then he returned his attention to the captain. \"For continuity, Captain, what check-in time do you currently have from our conversation?\" He kept the question limited to her existing understanding and waited, making no claim that the provisional change had taken effect."
    }
  },
  "changes": [
    {
      "operation": "open",
      "localRef": "private-checkin",
      "title": "Private check-in",
      "category": "schedule",
      "sourceSlot": "currentPlayer",
      "evidenceQuote": "Provisional revised check-in: 22:43, observation lounge."
    },
    {
      "operation": "addFact",
      "threadRef": "private-checkin",
      "text": "Provisional revised check-in: 22:43, observation lounge.",
      "claimType": "player-commitment",
      "authoredRef": null,
      "supersedesFactId": null,
      "sourceSlot": "currentPlayer",
      "evidenceQuote": "Provisional revised check-in: 22:43, observation lounge.",
      "informationAccess": {
        "recipientIds": [
          "priya-nayar"
        ],
        "acquisition": "read",
        "audienceEvidence": [
          {
            "sourceSlot": "currentPlayer",
            "evidenceQuote": "He opened a private message to Lieutenant Nayar and typed:"
          },
          {
            "sourceSlot": "currentPlayer",
            "evidenceQuote": "He sent the message without reading the proposed time or location aloud."
          }
        ]
      }
    }
  ]
};
const events = await materializeContinuityChanges({changes:preserved.changes,sourcePair:preserved.sourcePair,assistantAccepted:true,contributionIds:{previousAssistant:'audit.source.previous',currentPlayer:'audit.source.current'},branchId:'save.archive-audit',sourceRangeHash:'pair.audit',existingEvents:[],settledAtRevision:1,knownLinkIds:['priya-nayar','mara-whitaker']});
export function makeAudienceFixture() {
 const sourcePair=structuredClone(preserved.sourcePair);
 const messages=Object.values(sourcePair).map((s,i)=>({id:s.messageId,mes:s.text,is_user:i===1,...(i===0?{swipe_id:0,swipes:[s.text]}:{})}));
 const snapshot={state:{storySettlement:{branchId:'save.archive-audit',revision:1,continuityEvents:structuredClone(events),acceptedPairReceipts:[]}},sourceIdentities:new Map(events.flatMap(e=>e.sourceContributionIds.map((id,i)=>[id,e.sources[i]]))),characters:new Map([['priya-nayar',{name:'Priya Nayar',role:'Operations Officer'}],['mara-whitaker',{name:'Mara Whitaker',role:'Captain'}]])};
 return {snapshot,messages,sourcePair,admission:structuredClone(preserved.admission),identity:{chatId:'chat.audit',saveId:'save.archive-audit',branchId:'save.archive-audit',stateRevision:1,generationEpoch:1,settingsDigest:'settings.audit'},limits:{requestContextCharacters:48000}};
}
