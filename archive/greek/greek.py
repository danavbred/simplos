import fitz  # PyMuPDF
import random
import re

def extract_text_from_pdf(pdf_path):
    document = fitz.open(pdf_path)
    text = ""
    for page_num in range(len(document)):
        page = document.load_page(page_num)
        text += page.get_text("text")  # Use "text" option to preserve line breaks and spaces
    return text

def extract_greek_words(text):
    # Regex to match Greek words
    greek_words = re.findall(r'\b[Α-Ωα-ωάέήίόύώ]+\b', text)
    return greek_words

def process_words(words):
    unique_words = list(set(words))  # Remove duplicates
    random.shuffle(unique_words)  # Shuffle the list randomly
    return unique_words

def group_words(words, group_size=50):
    grouped_words = [words[i:i + group_size] for i in range(0, len(words), group_size)]
    return grouped_words

# Update the pdf_path with your local file path
pdf_path = "C:/Users/danav/OneDrive/Desktop/Vocabulary Bank/greek2.pdf"
extracted_text = extract_text_from_pdf(pdf_path)
greek_words = extract_greek_words(extracted_text)
processed_words = process_words(greek_words)
grouped_words = group_words(processed_words)

# Save the grouped words to a .txt file
output_path = "C:/Users/danav/OneDrive/Desktop/Vocabulary Bank/greek_words2.txt"
with open(output_path, "w", encoding="utf-8") as file:
    for group in grouped_words:
        file.write(", ".join(group) + "\n\n")  # Write each group as a comma-separated list

# Print a message to indicate the process is complete
print(f"Text extracted, processed, and saved to {output_path}")

# Pause the script so the console remains open
input("Press Enter to close the console.")
