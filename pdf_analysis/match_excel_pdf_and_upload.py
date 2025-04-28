from pdf_analysis import generate_image, PATH_TO_SAVE_IMAGES
from upload import upload_images
import pandas as pd

EXTRACTED_IFC = "extracted_ifc.csv"
ELEMENT_1 = "Element 1 Name"
ELEMENT_2 = "Element 2 Name"


def main():
    extracted_ifc = pd.read_csv(EXTRACTED_IFC)
    list_of_element_types = []
    for i in range(len(extracted_ifc)):
        line_i = extracted_ifc.iloc[i]
        element_1 = line_i[ELEMENT_1]
        element_2 = line_i[ELEMENT_2]
        elements = [element_1, element_2]
        for element in elements:
            if element not in list_of_element_types:
                results = generate_image(element)
                if ~results:
                    continue
                list_of_element_types.append(element)
    # upload images
    upload_images(PATH_TO_SAVE_IMAGES)


if __name__ == "__main__":
    main()
    print("---DONE---")
