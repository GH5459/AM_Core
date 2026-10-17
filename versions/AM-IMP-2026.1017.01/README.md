# Group invitation timeout

All group meeting/activity confirmation cards on this Leaf OA have a ten-minute confirmation window. Without the original organizer confirming/cancelling, the request transitions to cancelled without a message, reminder, identity lookup or calendar write. Cancelled requests retain original evidence. Buttons and text corrections cannot revive an expired invitation.

The durable first delivery-attempt timestamp is frozen before sending the card, so an uncertain delivery or process restart never extends an already visible card. Edits keep the initial deadline. Legacy unanswered cards without a delivery timestamp use original source time and expire quietly. Already confirmed fanout, normal task assignments and private calendar requests keep their existing behavior.
