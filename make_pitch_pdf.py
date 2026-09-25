import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

pdf_path = r"c:\Users\Administrator\Downloads\hack-the-weather-main\hack-the-weather-main\Conduit_Sentinel_Pitch_Script.pdf"

doc = SimpleDocTemplate(
    pdf_path,
    pagesize=letter,
    leftMargin=36,
    rightMargin=36,
    topMargin=36,
    bottomMargin=36
)

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "DocTitle",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=20,
    leading=24,
    textColor=colors.HexColor("#1d1d1f"),
    spaceAfter=4
)

subtitle_style = ParagraphStyle(
    "DocSubTitle",
    parent=styles["Normal"],
    fontName="Helvetica-Bold",
    fontSize=10,
    leading=13,
    textColor=colors.HexColor("#0071e3"),
    spaceAfter=10
)

meta_style = ParagraphStyle(
    "DocMeta",
    parent=styles["Normal"],
    fontName="Helvetica",
    fontSize=8.5,
    leading=12,
    textColor=colors.HexColor("#6e6e73")
)

h1_style = ParagraphStyle(
    "H1",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=12,
    leading=16,
    textColor=colors.HexColor("#1d1d1f"),
    spaceBefore=10,
    spaceAfter=6
)

act_header_style = ParagraphStyle(
    "ActHeader",
    parent=styles["Heading3"],
    fontName="Helvetica-Bold",
    fontSize=9.5,
    leading=13,
    textColor=colors.HexColor("#ffffff"),
    spaceBefore=0,
    spaceAfter=0
)

action_style = ParagraphStyle(
    "ActionText",
    parent=styles["Normal"],
    fontName="Helvetica-Oblique",
    fontSize=8,
    leading=11.5,
    textColor=colors.HexColor("#1d1d1f")
)

spoken_style = ParagraphStyle(
    "SpokenText",
    parent=styles["Normal"],
    fontName="Helvetica",
    fontSize=8.5,
    leading=12.5,
    textColor=colors.HexColor("#1d1d1f")
)

speaker_style = ParagraphStyle(
    "SpeakerName",
    parent=styles["Normal"],
    fontName="Helvetica-Bold",
    fontSize=8.5,
    leading=12,
    textColor=colors.HexColor("#0071e3")
)

elements = []

# Title Banner
elements.append(Paragraph("Conduit Sentinel: Hackathon Pitch & Video Masterplan", title_style))
elements.append(Paragraph("Official 3 to 5-Minute Demonstration Script — Complete Feature-by-Feature Flow", subtitle_style))
elements.append(Paragraph("<b>Event:</b> Hack The Weather 2026 (JHUB Africa @ JKUAT) | <b>Theme:</b> From Data to Impact<br/><b>Target Duration:</b> Exactly 4 Minutes 45 Seconds (Strict compliance with Section 9.1: 3 to 5 minutes)<br/><b>Requirement:</b> All team members must appear on camera | Complete live prototype demonstration | Closes with Simulation Studio", meta_style))
elements.append(Spacer(1, 8))
elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0071e3"), spaceAfter=10))

# Route Table
elements.append(Paragraph("Executive Navigation Flow & Timestamp Table", h1_style))

route_data = [
    [Paragraph("<b>Time</b>", meta_style), Paragraph("<b>Page / URL</b>", meta_style), Paragraph("<b>Feature Covered</b>", meta_style), Paragraph("<b>Primary On-Screen Action</b>", meta_style)],
    [Paragraph("0:00 - 0:40", meta_style), Paragraph("http://127.0.0.1:5173/<br/>(Live Station)", meta_style), Paragraph("Context & The Smallholder Problem", meta_style), Paragraph("Full-screen (F11), 3D digital twin globe rotating, webcams in corner.", meta_style)],
    [Paragraph("0:40 - 1:15", meta_style), Paragraph("http://127.0.0.1:5173/<br/>(Live Station)", meta_style), Paragraph("Real Conduit Telemetry & 8/8 QC Checks", meta_style), Paragraph("Hover on 8/8 Verified badge, dual rain gauges, SHT31 sensor.", meta_style)],
    [Paragraph("1:15 - 1:45", meta_style), Paragraph("http://127.0.0.1:5173/<br/>(Live Station)", meta_style), Paragraph("Diurnal Trends & 3-Day Forecast", meta_style), Paragraph("Hover on 24h diurnal cycle chart, show 3-day forecast card.", meta_style)],
    [Paragraph("1:45 - 2:30", meta_style), Paragraph("http://127.0.0.1:5173/irrigation<br/>(Irrigation Planner)", meta_style), Paragraph("FAO-56 Irrigation Math & Rain-Hold (0.0mm)", meta_style), Paragraph("Switch crop from Maize to Coffee, hover on Day 3 Rain Hold.", meta_style)],
    [Paragraph("2:30 - 3:10", meta_style), Paragraph("http://127.0.0.1:5173/map<br/>(Catchment Map)", meta_style), Paragraph("Geospatial Observatory & 4 Juja Sectors", meta_style), Paragraph("Click Ndarugu River, toggle Satellite tile, click speech audio.", meta_style)],
    [Paragraph("3:10 - 3:55", meta_style), Paragraph("http://127.0.0.1:5173/dispatch<br/>(USSD / SMS)", meta_style), Paragraph("2G Phone (*384*96#) & Safaricom SMS", meta_style), Paragraph("Click keypad *384*96#, show Kiswahili menu, show push SMS.", meta_style)],
    [Paragraph("3:55 - 4:25", meta_style), Paragraph("http://127.0.0.1:5173/ask<br/>(Ask Sentinel)", meta_style), Paragraph("Grounded Groq Cloud AI (Llama 3.3)", meta_style), Paragraph("Ask maize irrigation question, show instant grounded answer.", meta_style)],
    [Paragraph("4:25 - 4:55", meta_style), Paragraph("http://127.0.0.1:5173/simulate<br/>(Simulation Studio)", meta_style), Paragraph("The Grand Finale: Severe Storm Simulation", meta_style), Paragraph("Select Torrential Storm preset, run simulation, show red alert!", meta_style)],
    [Paragraph("4:55 - 5:00", meta_style), Paragraph("Webcam Center", meta_style), Paragraph("Climate Impact, Scalability & Closing", meta_style), Paragraph("All team members center frame, summarize 35% water savings.", meta_style)],
]

t_route = Table(route_data, colWidths=[60, 110, 170, 200])
t_route.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#f5f5f7")),
    ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ("TOPPADDING", (0,0), (-1,-1), 3),
    ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#d2d2d7")),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
]))
elements.append(t_route)
elements.append(Spacer(1, 10))

def build_act_card(time_str, title, route_str, on_screen_action, speaker_name, spoken_text):
    hdr_table = Table([[
        Paragraph(f"<b>{time_str} — {title}</b>", act_header_style),
        Paragraph(f"<b>Route:</b> {route_str}", ParagraphStyle("Rte", fontName="Helvetica-Bold", fontSize=8, textColor=colors.HexColor("#ffffff"), alignment=2))
    ]], colWidths=[360, 180])
    hdr_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#1d1d1f")),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ]))

    content_data = [
        [Paragraph("<b>ON-SCREEN ACTION:</b>", ParagraphStyle("ActH", fontName="Helvetica-Bold", fontSize=8, textColor=colors.HexColor("#86868b"))),
         Paragraph(on_screen_action, action_style)],
        [Paragraph(f"<b>{speaker_name}:</b>", speaker_style),
         Paragraph(spoken_text, spoken_style)]
    ]
    c_table = Table(content_data, colWidths=[110, 430])
    c_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#ffffff")),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor("#d2d2d7")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LINEBELOW", (0,0), (-1,0), 0.5, colors.HexColor("#ebebeb")),
    ]))
    return [hdr_table, c_table, Spacer(1, 8)]

# Act 1
elements.extend(build_act_card(
    "0:00 - 0:40",
    "Act 1: The Smallholder Climate Crisis in Juja",
    "http://127.0.0.1:5173/",
    "Press F11 for full-screen. Display Live Station overview with rotating 3D Earth digital twin globe. All team webcams visible in the screen corner.",
    "Speaker 1 (Lead)",
    "\"Hello judges! We are proud to present Conduit Sentinel, built for Hack The Weather 2026 under the theme 'From Data to Impact'. In Kenya, over 70% of smallholders in areas like Juja and Kiambu depend on rainfed agriculture or expensive pumped irrigation. But regional forecasts covering hundreds of kilometers completely miss hyper-local microclimates. Farmers irrigate hours before a sudden cloudburst, rotting crops and wasting diesel fuel. Or they spray pesticides that get washed away into the Ndarugu River. Worst of all, millions of farmers only have basic 2G feature phones. We built Conduit Sentinel to turn raw research telemetry from JKUAT into life-saving agronomic decisions for every farmer.\""
))

# Act 2
elements.extend(build_act_card(
    "0:40 - 1:15",
    "Act 2: Real Conduit Telemetry & 8/8 Sensor QC",
    "http://127.0.0.1:5173/",
    "Hover cursor over 'Hardware: Conduit Dual Bifacial Rig' and the green '8 / 8 Sensors Verified' badge. Point at Air Temp (12.7C), Humidity (87.7%), and dual rain gauges (0.0mm, delta 0.0mm).",
    "Speaker 2 (Data)",
    "\"Here is our live command center. Sentinel connects directly to the Conduit@Empathy automated research station at JKUAT. Notice our verified status: 8 out of 8 sensors active and healthy. Sentinel runs an automated Medallion data architecture: Bronze ingestion, Silver quality control, and Gold feature engineering. Crucially, Sentinel cross-validates JKUAT's dual tipping-bucket rain gauges in real time. If Gauge 1 and Gauge 2 diverge, our anomaly detector flags mechanical clogging before corrupt data can mislead farmers. We also ingest barometric pressure and solar flux to compute vapor pressure deficit.\""
))

# Act 3
elements.extend(build_act_card(
    "1:15 - 1:45",
    "Act 3: Diurnal Cycle & 3-Day Bias-Corrected Forecast",
    "http://127.0.0.1:5173/",
    "Hover mouse over the 24-Hour Diurnal Cycle line chart to show the interactive Apple glassmorphic tooltip. Then scroll to the 3-Day Local Forecast card showing Today, Tomorrow, and Day 3.",
    "Speaker 2 (Data)",
    "\"Scrolling down, our 24-hour diurnal cycle chart plots real-time thermal curves and evaporative demand. On the right, our 3-Day Local Forecast does something unique: it takes Numerical Weather Predictions from Open-Meteo and dynamically bias-corrects them against Conduit station ground truth. Instead of broad regional forecasts, Juja smallholders get hyper-local temperature bounds and calibrated precipitation probabilities for Today, Tomorrow, and Day 3.\""
))

# Act 4
elements.extend(build_act_card(
    "1:45 - 2:30",
    "Act 4: Dynamic 7-Day Irrigation Planner (FAO-56)",
    "http://127.0.0.1:5173/irrigation",
    "Click 'Irrigation Planner' in navbar. Switch crop from Maize to Coffee or Beans. Hover over the 7-day bar chart. Point directly to Day 3 bar showing the blue 'Rain Rest: 0.0 mm' indicator.",
    "Speaker 3 (Agronomy)",
    "\"Now, let's look at farm action in our 7-Day Irrigation Planner. Instead of static rules of thumb, Sentinel implements the physical FAO-56 Penman-Monteith thermodynamic equation. It takes live solar radiation, wind speed, vapor pressure deficit, and temperature from the Conduit station to calculate reference evapotranspiration (ET0). When a farmer selects their crop—such as Maize, Beans, or Coffee—Sentinel applies stage-specific crop coefficients (Kc) to calculate daily water deficit. Look at Day 3: when rainfall is detected, Sentinel automatically triggers a Rain Hold of 0.0 millimeters! It commands the farmer to suspend irrigation, saving up to 35% in pumping water and diesel expenses!\""
))

elements.append(PageBreak())

# Act 5
elements.extend(build_act_card(
    "2:30 - 3:10",
    "Act 5: Geospatial Catchment Observatory",
    "http://127.0.0.1:5173/map",
    "Click 'Catchment Map' in navbar. Show 2.2km JKUAT confidence circle. Click Ndarugu River Basin sector. Toggle layer from Irrigation Deficit to Spray Drift Safety. Switch to Satellite tile. Click Listen audio button.",
    "Speaker 1 (Lead)",
    "\"Next, we take this microclimate intelligence into the field with our Geospatial Catchment Observatory. Centered on JKUAT's 2.2-kilometer sensor circle, we divide the catchment into 4 key farming sectors: JKUAT Agronomy Research, Juja South Horticulture, Ndarugu River Basin, and Kalimoni Coffee Estate. Extension officers can toggle layers to inspect pesticide spray drift safety, ensuring chemicals never drift into neighboring communities or wash into the Ndarugu River. Every sector provides bilingual recommendations in English and Kiswahili, complete with spoken voice audio synthesis for field workers.\""
))

# Act 6
elements.extend(build_act_card(
    "3:10 - 3:55",
    "Act 6: Last-Mile 2G USSD (*384*96#) & Safaricom SMS",
    "http://127.0.0.1:5173/dispatch",
    "Click 'USSD / SMS' in navbar. On interactive 2G Nokia phone, click * 3 8 4 * 9 6 # and click Call. Show Kiswahili USSD menu. Press 1 to show live weather. Scroll right to show Mama Wanjiku push SMS stream. Click Listen Spoken Advisory.",
    "Speaker 2 (Data)",
    "\"Here is how Conduit Sentinel bridges the digital divide for smallholders who do not own smartphones. Under USSD / SMS Dispatch, we built a fully interactive 2G feature phone simulator. Any smallholder dials *384*96# on a basic phone to receive zero-data advisories in English or Kiswahili. On the right, our automated Safaricom GSM push stream sends proactive morning SMS alerts to local farmers—like Mama Wanjiku in Juja South—advising them of rain holds before they spend money on pumping. We also integrate Web Speech audio for illiterate or visually impaired farmers.\""
))

# Act 7
elements.extend(build_act_card(
    "3:55 - 4:25",
    "Act 7: Grounded AI Assistant (Groq Cloud LLM)",
    "http://127.0.0.1:5173/ask",
    "Click 'Ask Sentinel' in navbar. Click suggestion button 'Should I irrigate my maize today?'. Point to green 'Engine: Groq Llama 3.3 / GPT-OSS' badge. Show instant response citing JKUAT temperature, ET0, and rain risk.",
    "Speaker 3 (Agronomy)",
    "\"For farmers and agronomists seeking direct answers, our Ask Sentinel assistant is powered by ultra-fast Groq Cloud LLMs. Crucially, our AI has strict guardrails: the prompt injects real Conduit telemetry, reference ET0, and soil moisture balance, ensuring zero hallucinations. And if internet connectivity drops, Sentinel automatically falls back to an offline deterministic expert system that runs locally with zero external API dependencies.\""
))

# Act 8
elements.extend(build_act_card(
    "4:25 - 4:55",
    "Act 8: The Grand Finale — Extreme Climate Simulation",
    "http://127.0.0.1:5173/simulate",
    "Click 'Simulate' in navbar. Click 'Severe Storm & Torrential Rain' card. Click 'Run Simulation Scenario'. Show instant red storm warning and automated 0.0mm emergency irrigation shutdown alert!",
    "Speaker 1 (Lead)",
    "\"To prove our system's real-time capability, judges can explore our What-If Simulation Studio. Here, we can simulate extreme weather scenarios—such as flash floods, severe heatwaves, or sensor failures. Watch what happens when I trigger a Severe Storm scenario: instantly, Sentinel detects 18.5 mm of rain and high wind, triggers an emergency flash flood alert, and forces all irrigation systems across Juja to shut down immediately!\""
))

# Act 9
elements.extend(build_act_card(
    "4:55 - 5:00",
    "Act 9: Climate Impact, Scalability & Winning Close",
    "Webcam Full Center",
    "All team members visible center frame on camera. Display confident smile and professional posture.",
    "All Speakers",
    "\"Conduit Sentinel saves up to 35% in smallholder irrigation costs, prevents toxic river runoff into the Ndarugu basin, and brings climate intelligence to feature phone farmers across Kenya. Our Medallion architecture is ready to scale across all Conduit stations in Africa. Conduit Sentinel turns data into true climate resilience. Thank you!\""
))

doc.build(elements)
print(f"SUCCESS: PDF generated at {pdf_path}")
print(f"FILE SIZE: {os.path.getsize(pdf_path)} bytes")
