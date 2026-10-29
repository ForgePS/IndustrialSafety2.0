/**
 * Official OSHA Form 300 / 300A / 301 (Rev. 04/2004) instruction and label copy.
 * Wording mirrors the U.S. Department of Labor fillable PDF forms.
 */

export const OSHA_FORM_REVISION = "Rev. 04/2004";
export const OSHA_OMB = "Form approved OMB no. 1218-0176";

export const OSHA_ATTENTION =
  "This form contains information relating to employee health and must be used in a manner that protects the confidentiality of employees to the extent possible while the information is being used for occupational safety and health purposes.";

export const FORM_300 = {
  title: "OSHA's Form 300",
  subtitle: "Log of Work-Related Injuries and Illnesses",
  pleaseRecordHeading: "Please Record",
  pleaseRecord: [
    "Deaths",
    "Injuries and illnesses that involve loss of consciousness, restricted work activity or job transfer, days away from work, or medical treatment beyond first aid",
    "See 29 CFR Part 1904.8 through 1904.12 for additional guidance and criteria",
  ],
  remindersHeading: "Reminders",
  reminders: [
    "Complete an Injury and Illness Incident Report (Form 301) or equivalent for each recordable case",
    "You may seek help from OSHA offices for questions about recording",
    "Complete all 5 steps for each case recorded on this form",
  ],
  steps: {
    1: "Step 1. Identify the person",
    2: "Step 2. Describe the case",
    3: "Step 3. Classify the case",
    4: "Step 4. Enter the number of days the injured or ill worker was:",
    5: "Step 5. Mark the injury or illness category",
  },
  columns: {
    A: "(A) Case no.",
    B: "(B) Employee's name",
    C: "(C) Job title (e.g., Welder)",
    D: "(D) Date of injury or onset of illness",
    E: "(E) Where the event occurred (e.g., Loading dock north end)",
    F: "(F) Describe injury or illness, parts of body affected, and object/substance that directly injured or made person ill (e.g., Second degree burns on right forearm from acetylene torch)",
    G: "(G) Death",
    H: "(H) Days away from work",
    I: "(I) Job transfer or restriction",
    J: "(J) Other recordable cases",
    K: "(K) Away from work",
    L: "(L) On job transfer or restriction",
    M: "(M) Illness",
  },
  classifyNote: "SELECT ONLY ONE circle based on the most serious outcome for that case:",
  illnessCategories: {
    "1": "(1) Injury",
    "2": "(2) Skin disorder",
    "3": "(3) Respiratory condition",
    "4": "(4) Poisoning",
    "5": "(5) Hearing loss",
    "6": "(6) All other illnesses",
  },
  pageTotalsNote:
    "Page totals — Transfer these totals to the Summary page (Form 300A) before you post it.",
  publicBurden:
    "Public reporting burden for this collection of information is estimated to average 14 minutes per response, including time for reviewing instructions, searching existing data sources, gathering and maintaining the data needed, and completing and reviewing the collection of information. Persons are not required to respond to the collection of information unless it displays a currently valid OMB control number. If you have any comments about these estimates or any other aspects of this data collection, contact: US Department of Labor, OSHA Office of Statistical Analysis, Room N-3644, 200 Constitution Avenue, NW, Washington, DC 20210. Do not send the completed forms to this office.",
} as const;

export const FORM_300A = {
  title: "OSHA's Form 300A",
  subtitle: "Summary of Work-Related Injuries and Illnesses",
  instructions: [
    "All establishments covered by Part 1904 must complete this Summary page, even if no work-related injuries or illnesses occurred during the year. Remember to review the Log to verify that the entries are complete and accurate before completing this summary.",
    'Using the Log, count the individual entries you made for each category. Then write the totals below, making sure you\'ve added the entries from every page of the Log. If you had no cases, write "0."',
    "Employees, former employees, and their representatives have the right to review the OSHA Form 300 in its entirety. They also have limited access to the OSHA Form 301 or its equivalent. See 29 CFR Part 1904.35, in OSHA's recordkeeping rule, for further details on the access provisions for these forms.",
  ],
  numberOfCases: "Number of Cases",
  numberOfDays: "Number of Days",
  injuryAndIllnessTypes: "Injury and Illness Types",
  totalNumberOf: "(M)",
  establishmentInformation: "Establishment information",
  employmentInformation: "Employment information",
  employmentNote:
    "(If you don't have these figures, see the Worksheet on the next page to estimate.)",
  signHere: "Sign here",
  falsifyWarning: "Knowingly falsifying this document may result in a fine.",
  certification:
    "I certify that I have examined this document and that to the best of my knowledge the entries are true, accurate, and complete.",
  postNotice:
    "Post this Summary page from February 1 to April 30 of the year following the year covered by the form.",
  labels: {
    G: "(G) Total number of deaths",
    H: "(H) Total number of cases with days away from work",
    I: "(I) Total number of cases with job transfer or restriction",
    J: "(J) Total number of other recordable cases",
    K: "(K) Total number of days away from work",
    L: "(L) Total number of days of job transfer or restriction",
    M1: "(1) Injuries",
    M2: "(2) Skin disorders",
    M3: "(3) Respiratory conditions",
    M4: "(4) Poisonings",
    M5: "(5) Hearing loss",
    M6: "(6) All other illnesses",
    establishmentName: "Establishment name",
    street: "Street",
    city: "City",
    state: "State",
    zip: "Zip",
    industryDescription: "Industry description (e.g., Manufacture of motor truck trailers)",
    naics: "Standard Industrial Classification (SIC), if known (e.g., 3715) / NAICS",
    annualAverageEmployees: "Annual average number of employees",
    totalHoursWorked: "Total hours worked by all employees last year",
    companyExecutive: "Company executive",
    title: "Title",
    phone: "Phone",
    date: "Date",
  },
  publicBurden:
    "Public reporting burden for this collection of information is estimated to average 58 minutes per response, including time for reviewing instructions, searching existing data sources, gathering and maintaining the data needed, and completing and reviewing the collection of information. Persons are not required to respond to the collection of information unless it displays a currently valid OMB control number. If you have any comments about these estimates or any other aspects of this data collection, contact: US Department of Labor, OSHA Office of Statistical Analysis, Room N-3644, 200 Constitution Avenue, NW, Washington, DC 20210. Do not send the completed forms to this office.",
} as const;

export const FORM_301 = {
  title: "OSHA's Form 301",
  subtitle: "Injury and Illness Incident Report",
  instructions: [
    "This Injury and Illness Incident Report is one of the first forms you must fill out when a recordable work-related injury or illness has occurred. Together with the Log of Work-Related Injuries and Illnesses and the accompanying Summary, these forms help the employer and OSHA develop a picture of the extent and severity of work-related incidents.",
    "Within 7 calendar days after you receive information that a recordable work-related injury or illness has occurred, you must fill out this form or an equivalent. Some state workers' compensation, insurance, or other reports may be acceptable substitutes. To be considered an equivalent form, any substitute must contain all the information asked for on this form.",
    "According to Public Law 91-596 and 29 CFR 1904, OSHA's recordkeeping rule, you must keep this form on file for 5 years following the year to which it relates.",
    "If you need additional copies of this form, you may photocopy and use as many as you need.",
  ],
  completedBy: "Completed by",
  informationAboutEmployee: "Information about the employee",
  informationAboutPhysician: "Information about the physician or other health care professional",
  informationAboutCase: "Information about the case",
  fields: {
    fullName: "1) Full name",
    street: "2) Street",
    dateOfBirth: "3) Date of birth",
    dateHired: "4) Date hired",
    gender: "5) Male / Female",
    physician: "6) Name of physician or other health care professional",
    treatmentAway: "7) If treatment was given away from the worksite, where was it given?",
    emergencyRoom: "8) Was employee treated in an emergency room?",
    hospitalized: "9) Was employee hospitalized overnight as an in-patient?",
    caseNumber: "10) Case number from the Log",
    caseNumberNote: "(Transfer the case number from the Log after you record the case.)",
    injuryDate: "11) Date of injury or illness",
    timeBeganWork: "12) Time employee began work",
    timeOfEvent: "13) Time of event",
    timeCannotBeDetermined: "Check if time cannot be determined",
    activityBefore: "14) What was the employee doing just before the incident occurred?",
    activityBeforeHelp:
      'Describe the activity, as well as the tools, equipment, or material the employee was using. Be specific. Examples: "climbing a ladder while carrying roofing materials"; "spraying chlorine from hand sprayer"; "daily computer key-entry."',
    whatHappened: "15) What happened?",
    whatHappenedHelp:
      'Tell us how the injury occurred. Examples: "When ladder slipped on wet floor, worker fell 20 feet"; "Worker was sprayed with chlorine when gasket broke during replacement"; "Worker developed soreness in wrist over time."',
    injuryOrIllness: "16) What was the injury or illness?",
    injuryOrIllnessHelp:
      'Tell us the part of the body that was affected and how it was affected; be more specific than "hurt," "pain," or sore." Examples: "strained back"; "chemical burn, hand"; "carpal tunnel syndrome."',
    objectOrSubstance: "17) What object or substance directly harmed the employee?",
    objectOrSubstanceHelp:
      'Examples: "concrete floor"; "chlorine"; "radial arm saw." If this question does not apply to the incident, leave it blank.',
    dateOfDeath: "18) If the employee died, when did death occur? Date of death",
  },
  publicBurden:
    "Public reporting burden for this collection of information is estimated to average 22 minutes per response, including time for reviewing instructions, searching existing data sources, gathering and maintaining the data needed, and completing and reviewing the collection of information. Persons are not required to respond to the collection of information unless it displays a currently valid OMB control number. If you have any comments about these estimates or any other aspects of this data collection, contact: US Department of Labor, OSHA Office of Statistical Analysis, Room N-3644, 200 Constitution Avenue, NW, Washington, DC 20210. Do not send the completed forms to this office.",
} as const;

export const DOL_HEADER = {
  agency: "U.S. Department of Labor",
  osha: "Occupational Safety and Health Administration",
} as const;
