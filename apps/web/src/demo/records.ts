import {
  captureRecordingContext,
  type VehicleProfile,
} from "../../../../packages/diary/src/recording-context";
// Entirely fictional family profiles and recording places; never live vehicle observations.
export const demoVehicles: VehicleProfile[] = [
  {
    id: "demo-santafe",
    nickname: "우리집 붕붕이",
    manufacturer: "현대",
    model: "싼타페",
    bodyType: "SUV",
    modelYear: 2024,
    registrationNumber: "샘플 0001",
    source: "demo",
  },
  {
    id: "demo-avante",
    nickname: "첫 번째 가족 차",
    manufacturer: "현대",
    model: "아반떼",
    bodyType: "세단",
    modelYear: 2016,
    registrationNumber: "샘플 0002",
    source: "demo",
  },
];
export const members = [
  { id: "parent", name: "보호자", avatar: "/design/avatars/20.png" },
  { id: "child", name: "아이", avatar: "/design/avatars/21.png" },
] as const;
export const records = [
  {
    id: "sea",
    context: captureRecordingContext({
      capturedAt: "2026-11-08T07:42:00Z",
      vehicle: demoVehicles[0],
      location: {
        status: "available",
        label: "강원 강릉시 · 해변 주차장 (예시)",
        observedAt: "2026-11-08T07:41:55Z",
        source: "demo",
      },
    }),
    title: "같은 바다, 서로 다른 마음",
    date: "2026-11-08",
    day: "11월 8일 일요일",
    place: "바다",
    art: "beach",
    description: "바다를 좋아한 마음도, 파도가 무서웠던 마음도.",
    paragraph:
      "오늘 우리는 같은 바다를 보고 서로 다른 이야기를 남겼다. 보호자는 바다가 좋았고, 아이는 파도가 무서웠다. 함께한 하루 안에 각자의 마음이 있었다.",
    memories: [
      {
        member: "parent",
        text: "바다를 바라보는 시간이 좋았다.",
        source: "바다가 좋았어.",
      },
      { member: "child", text: "파도가 무서웠다.", source: "파도가 무서웠어." },
    ],
  },
  {
    id: "park",
    context: captureRecordingContext({
      capturedAt: "2026-11-01T06:20:00Z",
      vehicle: demoVehicles[0],
      location: {
        status: "available",
        label: "서울 · 공원 주차장 (예시)",
        observedAt: "2026-11-01T06:19:55Z",
        source: "demo",
      },
    }),
    title: "연을 따라 걷던 오후",
    date: "2026-11-01",
    day: "11월 1일 일요일",
    place: "공원",
    art: "walk",
    description: "연이 올라가던 순간을 서로 다르게 기억했어요.",
    paragraph:
      "공원에서 연을 날렸다. 보호자는 함께 걷던 길이 좋았고, 아이는 연이 높이 올라간 순간을 기억했다.",
    memories: [
      {
        member: "parent",
        text: "공원에서 함께 걷는 시간이 좋았다.",
        source: "같이 걸으니까 좋았어.",
      },
      {
        member: "child",
        text: "연이 높이 올라가서 신났다.",
        source: "연이 엄청 높이 올라갔어. 신났어.",
      },
    ],
  },
  {
    id: "cafe",
    context: captureRecordingContext({
      capturedAt: "2026-10-25T05:10:00Z",
      vehicle: demoVehicles[1],
      location: { status: "unavailable" },
    }),
    title: "비를 기다리며 나눈 이야기",
    date: "2026-10-25",
    day: "10월 25일 일요일",
    place: "카페",
    art: "coffee",
    description: "창밖의 비와 따뜻한 우유가 남은 날.",
    paragraph:
      "카페에서 비가 그치기를 기다렸다. 보호자는 창밖을 바라보며 쉬었고, 아이는 따뜻한 우유가 좋았다고 말했다.",
    memories: [
      {
        member: "parent",
        text: "창밖을 보며 쉬었다.",
        source: "창밖을 보면서 좀 쉬었어.",
      },
      {
        member: "child",
        text: "따뜻한 우유가 좋았다.",
        source: "우유가 따뜻해서 좋았어.",
      },
    ],
  },
] as const;
export type DiaryRecord = (typeof records)[number];

// Synthetic recording metadata, shared by every preview diary. Not an STT result.
export const demoRecording = {
  src: "/demo/synthetic-signal.wav",
  spans: [
    { start: 0, end: 4 },
    { start: 4, end: 8 },
  ],
} as const;
