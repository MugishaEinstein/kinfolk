export type ApprovalPolicy = "one" | "two" | "three" | "majority" | "all";

/** Default rule: two distinct council approvals when at least two are eligible. */
export function approvalRequirement(eligibleCouncilMembers: number, policy: ApprovalPolicy = "two") {
  if (eligibleCouncilMembers <= 0) return 0;
  if (policy === "one") return 1;
  if (policy === "three") return Math.min(3, eligibleCouncilMembers);
  if (policy === "majority") return Math.floor(eligibleCouncilMembers / 2) + 1;
  if (policy === "all") return eligibleCouncilMembers;
  return Math.min(2, eligibleCouncilMembers);
}

export function proposalDecision(
  approvals: number,
  rejections: number,
  requiredApprovals: number,
): "approved" | "rejected" | "pending" {
  if (approvals >= requiredApprovals) return "approved";
  if (rejections >= requiredApprovals) return "rejected";
  return "pending";
}
